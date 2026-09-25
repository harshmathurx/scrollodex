import { CardFrame } from './frame';
import { finishLayer } from './finish';
import { Gyro } from './gyro';
import { boneFace } from './stage';
import { SPRINGS, loop, settled, stepSpring, type Spring, type Steppable } from './spring';
import type { VerifiedBundle } from './types';
import { clamp, el, esc, prefersReducedMotion, webHaptic, type HapticKind } from './util';

export interface RolodexItem {
  key: string;
  letter: string;
  bundle: VerifiedBundle;
}

export interface RolodexOptions {
  /** Called with the index into setItems() when the front card is tapped or Enter is pressed. */
  onOpen(i: number): void;
  /** Called with the index of the card now at the front (−1 when a divider or nothing is in front). */
  onChange?(i: number): void;
  haptic?(kind?: HapticKind): void;
  fonts?: Record<string, string>;
  /** Widest the front card gets, in CSS px (default 560). */
  maxWidth?: number;
  /** Insert a letter tab before each A–Z group (default true). */
  dividers?: boolean;
  reducedMotion?: boolean;
}

type Entry =
  | { kind: 'card'; item: number; letter: string; bundle: VerifiedBundle }
  | { kind: 'divider'; letter: string };

interface Slot {
  el: HTMLElement;
  box: HTMLElement;
  shade: HTMLElement;
  fw?: HTMLElement;
  live?: HTMLElement;
  still?: CardFrame;
  liveFrame?: CardFrame;
  shown: boolean;
}

const STEP_DEG = 9;
const BEHIND = 4;
const AHEAD = 2;
const AHEAD_DEG = 40;
const WHEEL_PX = 80;
const FRICTION = 0.92;
const LIVE_DELAY_MS = 120;
const TICK_MIN_MS = 50;
const FRONT_TILT = 6;

/**
 * The collection as a Rolodex drum (D38). Cards hang on a cylinder (radius 1.1× card height,
 * 9° apart); the four behind show their top edges, the two just passed curl under.
 * One flick turns exactly one card. Only the front card is live, and only while the drum
 * is at rest; every other card is a still rendering of the real card (animations off).
 */
export class Rolodex implements Steppable {
  readonly root: HTMLElement;
  private readonly o: RolodexOptions;
  private readonly drum: HTMLElement;
  private readonly hit: HTMLElement;
  private readonly sr: HTMLElement;
  private readonly reduce: boolean;
  private readonly gyro: Gyro;
  private readonly ro: ResizeObserver | undefined;
  private readonly io: IntersectionObserver | undefined;
  private entries: Entry[] = [];
  private slots: (Slot | undefined)[] = [];
  private shownIdx = new Set<number>();
  private pos = 0;
  private vel = 0;
  private target = 0;
  private spring: Spring = SPRINGS.snap;
  private momentum = false;
  private dragging = false;
  private front = -1;
  private lastTick = 0;
  private settledAt = 0;
  private visible = true;
  private destroyed = false;
  private W = 0;
  private H = 0;
  private top0 = 0;
  private tx = 0; private ty = 0; private vtx = 0; private vty = 0; private ttx = 0; private tty = 0;
  private wheel: { base: number; acc: number; t: ReturnType<typeof setTimeout> | undefined } = { base: 0, acc: 0, t: undefined };

  constructor(el0: HTMLElement, opts: RolodexOptions) {
    this.root = el0;
    this.o = { dividers: true, maxWidth: 560, ...opts };
    this.reduce = opts.reducedMotion ?? prefersReducedMotion();
    el0.classList.add('sx-rolo');
    if (this.reduce) el0.dataset.reduced = '';
    el0.innerHTML = '';
    this.drum = el('div', 'sx-drum', el0);
    this.hit = el('div', 'sx-rolo-hit', el0);
    this.hit.tabIndex = 0;
    this.hit.setAttribute('role', 'group');
    this.hit.setAttribute('aria-roledescription', 'card deck');
    this.sr = el('p', 'sx-sr', el0);
    this.sr.setAttribute('aria-live', 'polite');
    this.gyro = new Gyro((x, y) => this.setTilt(x, y));
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => {
        this.layout();
        this.render();
      });
      this.ro.observe(el0);
    }
    if (typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver((es) => {
        for (const e of es) {
          this.visible = e.isIntersecting;
          for (const i of this.shownIdx) this.slots[i]?.still?.setVisible(this.visible);
          if (this.visible) loop.add(this);
        }
      }, { threshold: 0.05 });
      this.io.observe(el0);
    }
    this.bind();
  }

  setItems(items: RolodexItem[]): void {
    const keep = this.frontEntry();
    const keepKey = keep?.kind === 'card' ? items.findIndex((it) => it.bundle.digest === keep.bundle.digest) : -1;
    this.clear();
    const entries: Entry[] = [];
    let last = '';
    items.forEach((it, i) => {
      const letter = (it.letter || '#').toUpperCase().slice(0, 1);
      if (this.o.dividers && letter !== last) entries.push({ kind: 'divider', letter });
      last = letter;
      entries.push({ kind: 'card', item: i, letter, bundle: it.bundle });
    });
    this.entries = entries;
    this.slots = new Array(entries.length);
    let start = entries.findIndex((e) => e.kind === 'card' && e.item === keepKey);
    if (start < 0) start = entries.findIndex((e) => e.kind === 'card');
    if (start < 0) start = 0;
    this.pos = this.target = start;
    this.vel = 0;
    this.front = -2;
    this.hit.hidden = !entries.length;
    this.layout();
    this.render();
    loop.add(this);
  }

  /** Spins to the letter's tab (or its first card) with the jump spring. */
  jumpTo(letter: string): void {
    const L = letter.toUpperCase();
    let i = this.entries.findIndex((e) => e.letter === L);
    if (i < 0) i = this.entries.findIndex((e) => e.letter > L);
    if (i < 0) i = this.entries.length - 1;
    if (i < 0) return;
    this.goTo(i, SPRINGS.jump);
    (this.o.haptic ?? webHaptic)('light');
  }

  /** Moves to the card with this index in setItems(). */
  show(item: number): void {
    const i = this.entries.findIndex((e) => e.kind === 'card' && e.item === item);
    if (i >= 0) this.goTo(i, SPRINGS.snap);
  }

  next(): void {
    this.goTo(Math.round(this.target) + 1, SPRINGS.flick);
  }

  prev(): void {
    this.goTo(Math.round(this.target) - 1, SPRINGS.flick);
  }

  setTilt(x: number, y: number): void {
    this.ttx = clamp(x);
    this.tty = clamp(y);
    loop.add(this);
  }

  enableGyro(): Promise<boolean> {
    return this.gyro.enable();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gyro.disable();
    this.ro?.disconnect();
    this.io?.disconnect();
    clearTimeout(this.wheel.t);
    this.clear();
    loop.remove(this);
    this.root.innerHTML = '';
    this.root.classList.remove('sx-rolo');
  }

  step(dt: number, now: number): boolean {
    if (this.destroyed) return false;
    const n = this.entries.length;
    if (this.momentum && !this.dragging) {
      this.pos += this.vel * dt;
      this.vel *= Math.pow(FRICTION, dt * 60);
      if (this.pos < -0.35 || this.pos > n - 1 + 0.35 || Math.abs(this.vel) < 3) {
        this.momentum = false;
        this.goTo(Math.round(clamp(this.pos + this.vel * 0.06, 0, n - 1)), SPRINGS.snap, false);
      }
    } else if (!this.dragging) {
      if (this.reduce) {
        this.pos = this.target;
        this.vel = 0;
      } else [this.pos, this.vel] = stepSpring(this.pos, this.vel, this.target, this.spring, dt);
    }
    [this.tx, this.vtx] = stepSpring(this.tx, this.vtx, this.ttx, SPRINGS.tilt, dt);
    [this.ty, this.vty] = stepSpring(this.ty, this.vty, this.tty, SPRINGS.tilt, dt);

    const atRest = !this.dragging && !this.momentum && settled(this.pos, this.vel, this.target, 0.002);
    if (atRest) {
      this.pos = this.target;
      this.vel = 0;
      if (!this.settledAt) this.settledAt = now;
    } else this.settledAt = 0;
    this.render();
    this.syncLive(atRest && now - this.settledAt >= LIVE_DELAY_MS);

    const tilting = !settled(this.tx, this.vtx, this.ttx) || !settled(this.ty, this.vty, this.tty);
    const waitingLive = atRest && now - this.settledAt < LIVE_DELAY_MS + 20;
    return this.visible && (!atRest || this.dragging || this.momentum || tilting || waitingLive);
  }

  private frontEntry(): Entry | undefined {
    return this.entries[Math.round(this.pos)];
  }

  private goTo(i: number, s: Spring, clampIt = true): void {
    const n = this.entries.length;
    if (!n) return;
    this.momentum = false;
    this.target = clampIt ? clamp(Math.round(i), 0, n - 1) : i;
    this.spring = s;
    loop.add(this);
  }

  private clear(): void {
    for (const s of this.slots) {
      s?.still?.kill();
      s?.liveFrame?.kill();
    }
    this.slots = [];
    this.shownIdx.clear();
    this.drum.innerHTML = '';
  }

  private layout(): void {
    const w = this.root.clientWidth;
    if (!w) return;
    this.W = Math.min(this.o.maxWidth ?? 560, w);
    this.H = this.W / 1.75;
    const R = this.H * 1.1;
    const peek = R * Math.sin(((BEHIND * STEP_DEG) * Math.PI) / 180);
    this.top0 = this.reduce ? 8 : Math.round(peek * 0.62 + 12);
    const total = this.top0 + this.H + Math.round(this.reduce ? 8 : this.H * 0.34);
    this.drum.style.height = total + 'px';
    this.hit.style.height = total + 'px';
    this.root.style.setProperty('--sx-r', `${R.toFixed(1)}px`);
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s) this.place(s);
    }
    for (const i of this.shownIdx) {
      const s = this.slots[i];
      s?.still?.fit(this.W);
      s?.liveFrame?.fit(this.W);
    }
  }

  private place(s: Slot): void {
    const w = this.root.clientWidth;
    s.el.style.width = this.W + 'px';
    s.el.style.height = this.H + 'px';
    s.el.style.left = ((w - this.W) / 2).toFixed(1) + 'px';
    s.el.style.top = this.top0 + 'px';
  }

  private slot(i: number): Slot {
    let s = this.slots[i];
    if (s) return s;
    const e = this.entries[i];
    const node = el('div', e.kind === 'divider' ? 'sx-ri sx-divider' : 'sx-ri');
    const box = el('div', 'sx-ri-b', node);
    if (e.kind === 'divider') {
      const idx = Math.max(0, e.letter.charCodeAt(0) - 65);
      const tab = el('div', 'sx-tab', node);
      tab.textContent = e.letter;
      tab.style.left = `${6 + (idx % 6) * 14}%`;
      node.setAttribute('aria-hidden', 'true');
    } else {
      const b = e.bundle;
      node.dataset.state = 'placeholder';
      box.appendChild(boneFace(b));
      const fw = el('div', 'sx-fw', box);
      const live = el('div', 'sx-fw sx-live', box);
      const mask = b.meta.finishMask ? b.images[b.meta.finishMask] : undefined;
      box.appendChild(finishLayer(b.meta, mask));
      s = { el: node, box, shade: el('div', 'sx-shade', box), fw, live, shown: false };
    }
    s ??= { el: node, box, shade: el('div', 'sx-shade', box), shown: false };
    this.drum.appendChild(node);
    this.slots[i] = s;
    this.place(s);
    return s;
  }

  private mountStill(i: number, s: Slot): void {
    const e = this.entries[i];
    if (e.kind !== 'card' || s.still || !s.fw) return;
    s.still = new CardFrame(s.fw, e.bundle, {
      face: 'front',
      still: true,
      fonts: this.o.fonts,
      onReady: () => {
        if (s.el.dataset.state === 'placeholder') s.el.dataset.state = 'still';
      },
      onFail: () => {
        s.el.dataset.state = 'fallback';
      },
    });
    s.still.fit(this.W);
    s.still.setVisible(this.visible);
  }

  private syncLive(want: boolean): void {
    const i = Math.round(this.pos);
    for (const j of this.shownIdx) {
      const s = this.slots[j];
      if (s?.liveFrame && (j !== i || !want)) {
        s.liveFrame.kill();
        s.liveFrame = undefined;
        s.el.classList.remove('sx-is-live');
      }
    }
    if (!want || this.reduce) return;
    const e = this.entries[i];
    const s = this.slots[i];
    if (e?.kind !== 'card' || !s?.live || s.liveFrame) return;
    s.liveFrame = new CardFrame(s.live, e.bundle, {
      face: 'front',
      fonts: this.o.fonts,
      onReady: () => s.el.classList.add('sx-is-live'),
    });
    s.liveFrame.fit(this.W);
    s.liveFrame.setVisible(true);
  }

  private render(): void {
    if (!this.W) return;
    const n = this.entries.length;
    const lo = Math.max(0, Math.floor(this.pos) - AHEAD - 1);
    const hi = Math.min(n - 1, Math.ceil(this.pos) + BEHIND + 2);
    for (const i of [...this.shownIdx]) {
      if (i < lo || i > hi) {
        const s = this.slots[i];
        if (s) {
          s.el.style.display = 'none';
          s.shown = false;
          if (Math.abs(i - this.pos) > BEHIND + 6) {
            s.still?.kill();
            s.still = undefined;
            s.liveFrame?.kill();
            s.liveFrame = undefined;
            if (s.el.dataset.state && s.el.dataset.state !== 'fallback') s.el.dataset.state = 'placeholder';
          }
        }
        this.shownIdx.delete(i);
      }
    }
    for (let i = lo; i <= hi; i++) {
      const s = this.slot(i);
      const d = i - this.pos;
      const visible = this.reduce ? Math.abs(d) < 0.5 : d > -AHEAD - 0.2 && d < BEHIND + 0.8;
      if (!visible) {
        if (s.shown) {
          s.el.style.display = 'none';
          s.shown = false;
        }
        continue;
      }
      if (!s.shown) {
        s.el.style.display = '';
        s.shown = true;
      }
      this.shownIdx.add(i);
      this.mountStill(i, s);
      this.transform(s, d);
    }
    const f = n ? clamp(Math.round(this.pos), 0, n - 1) : -1;
    if (f !== this.front) {
      const prev = this.front;
      this.front = f;
      const e = this.entries[f];
      const now = performance.now();
      if (prev >= 0 && now - this.lastTick >= TICK_MIN_MS) {
        this.lastTick = now;
        (this.o.haptic ?? webHaptic)('tick');
      }
      const cards = this.entries.filter((x) => x.kind === 'card').length;
      if (e?.kind === 'card') {
        this.sr.textContent = `${e.bundle.displayName}, ${e.item + 1} of ${cards}`;
        this.hit.setAttribute('aria-label', `Card deck, ${cards} cards. Front: ${e.bundle.displayName}. Arrow keys flick, Enter opens.`);
      } else if (e) {
        this.sr.textContent = `Letter ${e.letter}`;
      }
      this.o.onChange?.(e?.kind === 'card' ? e.item : -1);
    }
  }

  private transform(s: Slot, d: number): void {
    const R = this.H * 1.1;
    let rot: number;
    let op = 1;
    let shade = 0;
    let z: number;
    if (this.reduce) {
      rot = 0;
      z = 1000;
    } else if (d >= 0) {
      rot = d * STEP_DEG;
      shade = Math.min(0.45, d * 0.08);
      z = 1000 - Math.round(d * 10);
      if (d > BEHIND) op = Math.max(0, BEHIND + 0.8 - d) / 0.8;
    } else {
      rot = d * AHEAD_DEG;
      op = Math.max(0, 1 + d * 0.45);
      shade = Math.min(0.5, -d * 0.2);
      z = 990 - Math.round(-d * 10);
    }
    const front = Math.max(0, 1 - Math.abs(d));
    const tx = this.tx * front;
    const ty = this.ty * front;
    let tf = `translateZ(${(-R).toFixed(1)}px) rotateX(${rot.toFixed(2)}deg) translateZ(${R.toFixed(1)}px)`;
    if (front > 0) tf += ` rotateX(${(-ty * FRONT_TILT).toFixed(2)}deg) rotateY(${(tx * FRONT_TILT).toFixed(2)}deg)`;
    s.el.style.transform = tf;
    s.el.style.opacity = op.toFixed(3);
    s.el.style.zIndex = String(z);
    s.el.style.setProperty('--sx-tx', tx.toFixed(3));
    s.el.style.setProperty('--sx-ty', ty.toFixed(3));
    s.el.style.setProperty('--sx-t', Math.min(1, Math.hypot(tx, ty)).toFixed(3));
    s.shade.style.opacity = shade.toFixed(3);
  }

  private frontRect(): { left: number; top: number; width: number; height: number } {
    const w = this.root.clientWidth;
    return { left: (w - this.W) / 2, top: this.top0, width: this.W, height: this.H };
  }

  private tapAt(x: number, y: number): void {
    const r = this.frontRect();
    if (y >= r.top && y <= r.top + r.height && x >= r.left && x <= r.left + r.width) {
      const e = this.frontEntry();
      if (e?.kind === 'card') this.o.onOpen(e.item);
      else this.next();
      return;
    }
    if (y < r.top) {
      const R = this.H * 1.1;
      const up = r.top - y;
      let k = 1;
      while (k < BEHIND && R * Math.sin(((k + 0.5) * STEP_DEG * Math.PI) / 180) * 0.62 < up) k++;
      this.goTo(Math.round(this.target) + k, SPRINGS.snap);
    }
  }

  private bind(): void {
    const h = this.hit;
    h.addEventListener(
      'wheel',
      (e) => {
        const n = this.entries.length;
        if (!n) return;
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        if (Math.abs(dy) < Math.abs(e.deltaX)) return;
        const w = this.wheel;
        if (w.t === undefined && ((this.target <= 0 && dy < 0) || (this.target >= n - 1 && dy > 0))) return;
        e.preventDefault();
        if (w.t === undefined) {
          w.base = Math.round(this.target);
          w.acc = 0;
        }
        w.acc += dy;
        const cards = Math.trunc(w.acc / WHEEL_PX);
        const t = clamp(w.base + cards, 0, n - 1);
        if (t !== this.target) this.goTo(t, SPRINGS.snap);
        clearTimeout(w.t);
        w.t = setTimeout(() => {
          w.t = undefined;
        }, 140);
      },
      { passive: false },
    );

    let pd: { id: number; x: number; y: number; p: number; moved: boolean; samples: [number, number][] } | null = null;
    h.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      pd = { id: e.pointerId, x: e.clientX, y: e.clientY, p: this.pos, moved: false, samples: [[performance.now(), e.clientY]] };
      this.momentum = false;
      try {
        h.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
    });
    h.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && !pd) {
        const b = h.getBoundingClientRect();
        const r = this.frontRect();
        const px = (e.clientX - b.left - r.left) / r.width;
        const py = (e.clientY - b.top - r.top) / r.height;
        if (px >= 0 && px <= 1 && py >= 0 && py <= 1) this.setTilt(px * 2 - 1, py * 2 - 1);
        else this.setTilt(0, 0);
        return;
      }
      if (!pd || e.pointerId !== pd.id) return;
      const dy = e.clientY - pd.y;
      if (!pd.moved && Math.abs(dy) > 7) {
        pd.moved = true;
        this.dragging = true;
      }
      if (!pd.moved) return;
      const n = this.entries.length;
      let p = pd.p + dy / (this.H * 0.75);
      if (p < 0) p *= 0.35;
      if (p > n - 1) p = n - 1 + (p - (n - 1)) * 0.35;
      this.pos = this.target = p;
      this.vel = 0;
      pd.samples.push([performance.now(), e.clientY]);
      if (pd.samples.length > 6) pd.samples.shift();
      loop.add(this);
    });
    const up = (e: PointerEvent): void => {
      if (!pd || e.pointerId !== pd.id) return;
      const p = pd;
      pd = null;
      this.dragging = false;
      if (!p.moved) {
        if (e.type === 'pointerup') {
          const b = h.getBoundingClientRect();
          this.tapAt(e.clientX - b.left, e.clientY - b.top);
        }
        loop.add(this);
        return;
      }
      const s = p.samples;
      const a = s[0];
      const z = s[s.length - 1];
      const v = ((z[1] - a[1]) / Math.max(16, z[0] - a[0])) * 1000 / (this.H * 0.75);
      const start = Math.round(p.p);
      if (Math.abs(v) > 6 && !this.reduce) {
        this.vel = clamp(v, -40, 40);
        this.momentum = true;
      } else {
        let t = Math.round(this.pos);
        if (t === start && (Math.abs(this.pos - start) > 0.2 || Math.abs(v) > 1.5)) t = start + Math.sign(Math.abs(v) > 1.5 ? v : this.pos - start);
        this.vel = clamp(v, -8, 8);
        this.goTo(t, SPRINGS.flick);
      }
      loop.add(this);
    };
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
    h.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !pd) this.setTilt(0, 0);
    });
    h.addEventListener('keydown', (e) => {
      const c = Math.round(this.target);
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
        case 'PageDown':
        case 'j':
          e.preventDefault();
          this.goTo(c + 1, SPRINGS.flick);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'PageUp':
        case 'k':
          e.preventDefault();
          this.goTo(c - 1, SPRINGS.flick);
          break;
        case 'Home':
          e.preventDefault();
          this.goTo(0, SPRINGS.jump);
          break;
        case 'End':
          e.preventDefault();
          this.goTo(this.entries.length - 1, SPRINGS.jump);
          break;
        case 'Enter':
        case ' ': {
          e.preventDefault();
          const f = this.frontEntry();
          if (f?.kind === 'card') this.o.onOpen(f.item);
          break;
        }
        default:
          if (/^[a-z]$/i.test(e.key) && e.key !== 'j' && e.key !== 'k' && !e.metaKey && !e.ctrlKey) this.jumpTo(e.key);
      }
    });
  }
}

/** Plain HTML letter index for use beside a Rolodex (the app may draw its own). */
export function letterIndex(letters: string[], onPick: (l: string) => void): HTMLElement {
  const nav = el('nav', 'sx-az');
  nav.setAttribute('aria-label', 'Jump to letter');
  const have = new Set(letters.map((l) => l.toUpperCase()));
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const b = el('button', 'sx-az-l', nav);
    b.type = 'button';
    b.innerHTML = esc(L);
    b.disabled = !have.has(L);
    b.addEventListener('click', () => onPick(L));
  }
  return nav;
}
