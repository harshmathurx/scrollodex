import { CardFrame, type FrameFailure } from './frame';
import { finishLayer, normalizeFinish } from './finish';
import { Gyro } from './gyro';
import { SPRINGS, loop, settled, stepSpring, type Steppable } from './spring';
import type { CardState, Face, VerifiedBundle } from './types';
import { Emitter, clamp, el, esc, prefersReducedMotion, webHaptic, type HapticKind } from './util';

export interface CardStageOptions {
  /** Bind pointer, touch and keyboard input (default true). */
  interactive?: boolean;
  /** Drift gently when nobody is touching it (default false). */
  idle?: boolean;
  /** Max rotation per axis in degrees (default 12). */
  maxTilt?: number;
  /** Force reduced motion on or off; defaults to the OS setting. */
  reducedMotion?: boolean;
  /** Tap flips the card (default true). The 'tap' event fires either way. */
  tapToFlip?: boolean;
  /** Library font family → data:font/woff2 URI. */
  fonts?: Record<string, string>;
  /** Called at the 90° face swap and on other physical moments. Defaults to navigator.vibrate. */
  haptic?: (kind: HapticKind) => void;
  /** Extra line shown on the fallback face. */
  fallbackNote?: (why: FrameFailure | 'killed') => string;
  /** Content for the host's own back when the card has no back-face rules. */
  hostBack?: (b: VerifiedBundle) => HTMLElement;
  /** Accessible label for the card. */
  label?: (b: VerifiedBundle) => string;
}

export type StageEvent = 'ready' | 'killed' | 'tap' | 'flip';

const BACK_RULE = /\[\s*data-face\s*[~|^$*]?=\s*["']?back\b/i;
const TAP_MS = 350;

/** True when the card's CSS styles a back face (SCF-0 §2.3). */
export function hasBackFace(html: string): boolean {
  return BACK_RULE.test(html);
}

/** A cheap static face drawn by the host: the bone fallback, and the stand-in for cards not yet loaded. */
export function boneFace(b: Pick<VerifiedBundle, 'displayName' | 'handle' | 'meta'>, note = ''): HTMLElement {
  const face = el('div', 'sx-bone');
  const bg = b.meta.background;
  if (bg && /^#[0-9a-f]{3,8}$|^[a-z]+$|^rgba?\([\d\s.,%/]+\)$/i.test(bg)) face.style.setProperty('--sx-card-bg', bg);
  face.innerHTML =
    `<b class="sx-bone-name">${esc(b.displayName)}</b>` +
    `<span class="sx-bone-handle">@${esc(b.handle)}</span>` +
    (note ? `<i class="sx-bone-note">${esc(note)}</i>` : '');
  return face;
}

/**
 * One card in your hand. Two frames back-to-back, a finish layer above each, and a
 * transparent host layer on top that takes every touch (D29). The host owns tilt,
 * flip, glare and shadow (D9); the card documents never run script.
 */
export class CardStage implements Steppable {
  readonly root: HTMLElement;
  state: CardState = 'placeholder';
  face: Face = 'front';

  private readonly o: Required<Pick<CardStageOptions, 'interactive' | 'idle' | 'maxTilt' | 'tapToFlip'>> & CardStageOptions;
  private readonly events = new Emitter<StageEvent>();
  private readonly body: HTMLElement;
  private readonly faces: Record<Face, HTMLElement>;
  private readonly shadow: HTMLElement;
  private readonly hit: HTMLElement;
  private readonly gyro: Gyro;
  private readonly io: IntersectionObserver | undefined;
  private readonly ro: ResizeObserver | undefined;
  private frames: Partial<Record<Face, CardFrame>> = {};
  private bundle: VerifiedBundle | null = null;
  private reduce: boolean;
  private visible = false;
  private destroyed = false;
  // tilt (−1…1), its velocity and target; flip angle in degrees
  private tx = 0; private ty = 0; private vx = 0; private vy = 0; private ttx = 0; private tty = 0;
  private a = 0; private va = 0; private ta = 0;
  private lift = 0; private vlift = 0; private tlift = 0;
  private lastInput = -1e9;
  private recentring = false;
  private portrait = false;

  constructor(el0: HTMLElement, opts: CardStageOptions = {}) {
    this.root = el0;
    this.o = { interactive: true, idle: false, maxTilt: 12, tapToFlip: true, ...opts };
    this.reduce = opts.reducedMotion ?? prefersReducedMotion();
    el0.classList.add('sx-stage');
    el0.dataset.state = 'placeholder';
    if (this.reduce) el0.dataset.reduced = '';
    el0.innerHTML = '';
    this.body = el('div', 'sx-body', el0);
    this.faces = { front: el('div', 'sx-face sx-front', this.body), back: el('div', 'sx-face sx-back', this.body) };
    el('div', 'sx-edge', this.body);
    this.shadow = el('div', 'sx-shadow', el0);
    this.hit = el('div', 'sx-hit', el0);
    this.hit.tabIndex = this.o.interactive ? 0 : -1;
    this.hit.setAttribute('role', 'button');
    this.hit.setAttribute('aria-roledescription', 'card');
    this.gyro = new Gyro((x, y) => this.setTilt(x, y));

    if (typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver((es) => {
        for (const e of es) this.setVisible(e.isIntersecting);
      }, { threshold: 0.05 });
      this.io.observe(el0);
    } else this.setVisible(true);
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(el0);
    }
    if (this.o.interactive) this.bind();
  }

  on(ev: StageEvent, fn: (e?: unknown) => void): () => void {
    return this.events.on(ev, fn);
  }

  load(b: VerifiedBundle): void {
    if (this.destroyed) return;
    this.unmount();
    this.bundle = b;
    this.portrait = b.meta.orientation === 'portrait';
    this.root.dataset.orientation = this.portrait ? 'portrait' : 'landscape';
    this.root.dataset.finish = normalizeFinish(b.meta.finish);
    this.hit.setAttribute('aria-label', this.o.label?.(b) ?? `${b.displayName}'s card. Press Enter to flip.`);
    this.a = this.ta = this.va = 0;
    this.face = 'front';
    this.setState('placeholder');

    const mask = b.meta.finishMask ? b.images[b.meta.finishMask] : undefined;
    const ownBack = hasBackFace(b.html);
    for (const face of ['front', 'back'] as const) {
      const box = this.faces[face];
      box.innerHTML = '';
      box.appendChild(boneFace(b));
      const fw = el('div', 'sx-fw', box);
      if (face === 'back' && !ownBack) {
        fw.appendChild(this.o.hostBack?.(b) ?? this.defaultHostBack(b));
        fw.classList.add('sx-host-back');
      } else {
        this.frames[face] = new CardFrame(fw, b, {
          face,
          fonts: this.o.fonts,
          onReady: face === 'front' ? () => this.setState('live') : undefined,
          onFail: (why) => this.fail(why),
        });
      }
      box.appendChild(finishLayer(b.meta, mask));
    }
    this.fit();
    for (const f of Object.values(this.frames)) f?.setVisible(this.visible);
    loop.add(this);
  }

  flip(): void {
    if (!this.bundle) return;
    this.ta = this.ta === 0 ? 180 : 0;
    if (this.reduce) {
      this.a = this.ta;
      this.va = 0;
    }
    this.lastInput = performance.now();
    loop.add(this);
  }

  /** Sets the tilt target (−1…1 each axis), e.g. from an app-level sensor. */
  setTilt(x: number, y: number): void {
    this.ttx = clamp(x);
    this.tty = clamp(y);
    this.recentring = false;
    this.lastInput = performance.now();
    loop.add(this);
  }

  /** Asks for motion access (call from a tap on iOS). Returns whether tilt-with-phone is on. */
  enableGyro(): Promise<boolean> {
    return this.gyro.enable();
  }

  /** A cheap static stand-in: the bone face with the finish drawn over it. */
  snapshot(): HTMLElement {
    const box = el('div', 'sx-snap');
    if (!this.bundle) return box;
    box.appendChild(boneFace(this.bundle));
    const mask = this.bundle.meta.finishMask ? this.bundle.images[this.bundle.meta.finishMask] : undefined;
    box.appendChild(finishLayer(this.bundle.meta, mask));
    return box;
  }

  /** Stops the card (watchdog or blocklist) and shows the fallback. Tilt and flip keep working. */
  kill(note?: string): void {
    this.unmountFrames();
    this.showFallback(note ?? this.o.fallbackNote?.('killed') ?? '');
    this.setState('killed');
    this.events.emit('killed', 'killed');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gyro.disable();
    this.io?.disconnect();
    this.ro?.disconnect();
    this.unmount();
    loop.remove(this);
    this.events.clear();
    this.root.innerHTML = '';
    this.root.classList.remove('sx-stage');
  }

  step(dt: number, now: number): boolean {
    if (this.destroyed) return false;
    const idle = now - this.lastInput > 2600;
    if (!this.gyro.active && idle) {
      if (this.o.idle && !this.reduce) {
        const t = now / 1000;
        this.ttx = Math.sin(t * 0.7) * 0.4;
        this.tty = Math.cos(t * 0.5) * 0.25;
      } else if (this.ttx || this.tty) {
        this.ttx = this.tty = 0;
        this.recentring = true;
      }
    }
    const tiltSpring = this.recentring ? SPRINGS.recentre : SPRINGS.tilt;
    [this.tx, this.vx] = stepSpring(this.tx, this.vx, this.ttx, tiltSpring, dt);
    [this.ty, this.vy] = stepSpring(this.ty, this.vy, this.tty, tiltSpring, dt);
    [this.lift, this.vlift] = stepSpring(this.lift, this.vlift, this.tlift, SPRINGS.tilt, dt);
    if (!this.reduce) [this.a, this.va] = stepSpring(this.a, this.va, this.ta, SPRINGS.flip, dt);
    this.render();

    const moving =
      !settled(this.tx, this.vx, this.ttx) || !settled(this.ty, this.vy, this.tty) ||
      !settled(this.a, this.va, this.ta, 0.05) || !settled(this.lift, this.vlift, this.tlift);
    return this.visible && (moving || (this.o.idle && !this.reduce && !this.gyro.active && idle));
  }

  private render(): void {
    const amp = this.reduce ? 0.35 : 1;
    const m = this.o.maxTilt * amp;
    const tx = this.reduce ? -0.12 + this.tx * 0.35 : this.tx;
    const ty = this.reduce ? 0.08 + this.ty * 0.35 : this.ty;
    const rx = (-ty * m).toFixed(2);
    const ry = (tx * m).toFixed(2);
    const deg = this.reduce ? 0 : this.a;
    const flip = deg.toFixed(2);
    const scale = (1 + this.lift * 0.02).toFixed(4);
    this.body.style.transform = this.portrait
      ? `scale(${scale}) rotateX(${rx}deg) rotateY(${ry}deg) rotateX(${flip}deg)`
      : `scale(${scale}) rotateX(${rx}deg) rotateY(${(Number(ry) + deg).toFixed(2)}deg)`;
    const s = this.root.style;
    s.setProperty('--sx-tx', tx.toFixed(3));
    s.setProperty('--sx-ty', ty.toFixed(3));
    const mag = Math.min(1, Math.hypot(tx, ty));
    s.setProperty('--sx-t', mag.toFixed(3));
    const edge = Math.abs(Math.sin((deg * Math.PI) / 180));
    this.shadow.style.transform =
      `translate(${(-tx * 10).toFixed(1)}px, ${(8 + ty * 6).toFixed(1)}px) scale(${(1 + mag * 0.12 + this.lift * 0.04).toFixed(3)}, ${(1 - edge * 0.5).toFixed(3)})`;
    this.shadow.style.opacity = (0.25 - mag * 0.08 + this.lift * 0.05).toFixed(3);

    const ang = ((this.a % 360) + 360) % 360;
    const nf: Face = this.reduce ? (this.ta === 180 ? 'back' : 'front') : ang > 90 && ang < 270 ? 'back' : 'front';
    if (nf !== this.face) {
      this.face = nf;
      this.root.dataset.face = nf;
      (this.o.haptic ?? webHaptic)('light');
      this.events.emit('flip', nf);
    }
  }

  private setVisible(v: boolean): void {
    this.visible = v;
    for (const f of Object.values(this.frames)) f?.setVisible(v);
    if (v) loop.add(this);
  }

  private fit(): void {
    const w = this.faces.front.clientWidth;
    if (!w) return;
    for (const f of Object.values(this.frames)) f?.fit(w);
  }

  private setState(s: CardState): void {
    this.state = s;
    this.root.dataset.state = s;
    if (s === 'live') this.events.emit('ready');
  }

  private fail(why: FrameFailure): void {
    if (why === 'ready-timeout') {
      // Keep loading behind the fallback; a late load still brings the card to life.
      if (this.state === 'placeholder') {
        this.showFallback(this.o.fallbackNote?.(why) ?? '');
        this.setState('fallback');
      }
      return;
    }
    this.kill(this.o.fallbackNote?.(why));
  }

  private showFallback(note: string): void {
    if (!this.bundle) return;
    for (const face of ['front', 'back'] as const) {
      const old = this.faces[face].querySelector('.sx-bone');
      old?.replaceWith(boneFace(this.bundle, face === 'front' ? note : ''));
    }
  }

  private defaultHostBack(b: VerifiedBundle): HTMLElement {
    const back = boneFace(b);
    back.classList.add('sx-host-back-face');
    return back;
  }

  private unmountFrames(): void {
    for (const f of Object.values(this.frames)) f?.kill();
    this.frames = {};
  }

  private unmount(): void {
    this.unmountFrames();
    this.faces.front.innerHTML = '';
    this.faces.back.innerHTML = '';
  }

  private bind(): void {
    const h = this.hit;
    let pd: { id: number; x: number; y: number; t: number; type: string } | null = null;
    const pos = (e: PointerEvent): [number, number] => {
      const r = h.getBoundingClientRect();
      return [clamp((e.clientX - r.left) / r.width, 0, 1) * 2 - 1, clamp((e.clientY - r.top) / r.height, 0, 1) * 2 - 1];
    };
    h.addEventListener('pointermove', (e) => {
      if (this.gyro.active && e.pointerType !== 'mouse') return;
      if (e.pointerType === 'mouse' || (pd && pd.id === e.pointerId)) {
        const [x, y] = pos(e);
        this.setTilt(x, y);
      }
    });
    h.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      pd = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
      this.tlift = 1;
      loop.add(this);
    });
    const end = (e: PointerEvent, cancelled: boolean): void => {
      if (!pd || pd.id !== e.pointerId) return;
      const dx = e.clientX - pd.x;
      const dy = e.clientY - pd.y;
      const dt = performance.now() - pd.t;
      const type = pd.type;
      pd = null;
      this.tlift = 0;
      if (type !== 'mouse' && !this.gyro.active) {
        this.ttx = this.tty = 0;
        this.recentring = true;
      }
      loop.add(this);
      if (cancelled) return;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) this.flip();
      else if (Math.hypot(dx, dy) < 10 && dt < TAP_MS) {
        this.events.emit('tap');
        if (this.o.tapToFlip) this.flip();
      }
    };
    h.addEventListener('pointerup', (e) => end(e, false));
    h.addEventListener('pointercancel', (e) => end(e, true));
    h.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !pd) {
        this.ttx = this.tty = 0;
        this.recentring = true;
        this.lastInput = performance.now();
        loop.add(this);
      }
    });
    h.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.flip();
      }
    });
  }
}
