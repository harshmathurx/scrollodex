import { CARD_CSP, buildSrcdoc, CARD_SIZE } from './srcdoc';
import type { Face, VerifiedBundle } from './types';

export type FrameFailure = 'ready-timeout' | 'navigated' | 'build';

export interface FrameOptions {
  face: Face;
  fonts?: Record<string, string>;
  still?: boolean;
  readyTimeoutMs?: number;
  onReady?: () => void;
  onFail?: (why: FrameFailure) => void;
}

/**
 * One face of one card: an <iframe sandbox=""> holding a script-less srcdoc.
 * Ready is the frame's first load event. A second load means the card navigated,
 * which the sandbox should make impossible, so the frame is killed (D37).
 * The ready clock starts when the frame first becomes visible (D14).
 */
export class CardFrame {
  readonly iframe: HTMLIFrameElement;
  ready = false;
  dead = false;
  private loads = 0;
  private visible = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly w: number;

  constructor(parent: HTMLElement, bundle: VerifiedBundle, private o: FrameOptions) {
    const size = CARD_SIZE[bundle.meta.orientation === 'portrait' ? 'portrait' : 'landscape'];
    this.w = size.w;
    const f = (this.iframe = document.createElement('iframe'));
    f.setAttribute('sandbox', '');
    f.setAttribute('allow', '');
    f.setAttribute('referrerpolicy', 'no-referrer');
    f.setAttribute('loading', 'eager');
    f.setAttribute('scrolling', 'no');
    f.setAttribute('aria-hidden', 'true');
    f.setAttribute('csp', CARD_CSP);
    f.tabIndex = -1;
    f.className = 'sx-frame';
    f.style.width = size.w + 'px';
    f.style.height = size.h + 'px';
    f.addEventListener('load', this.onLoad);
    let doc: string;
    try {
      doc = buildSrcdoc(bundle, o.face, o.fonts, { still: o.still });
    } catch {
      this.dead = true;
      queueMicrotask(() => o.onFail?.('build'));
      return;
    }
    f.srcdoc = doc;
    parent.appendChild(f);
  }

  private onLoad = (): void => {
    if (this.dead) return;
    this.loads += 1;
    if (this.loads > 1) {
      this.kill();
      this.o.onFail?.('navigated');
      return;
    }
    this.ready = true;
    clearTimeout(this.timer);
    this.o.onReady?.();
  };

  /** Scales the fixed 700×400 (or 400×700) document down to the box width. Never scales the
   * iframe up past its authored 1:1 resolution — that's the only direction that blurs it; a box
   * wider than the document's native size renders at native size rather than upscaling. */
  fit(boxWidth: number): void {
    if (this.dead) return;
    const scale = Math.min(1, boxWidth / this.w);
    this.iframe.style.transform = `scale(${scale.toFixed(5)})`;
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    if (v && !this.ready && !this.timer && !this.dead) {
      this.timer = setTimeout(() => {
        if (!this.ready && !this.dead) this.o.onFail?.('ready-timeout');
      }, this.o.readyTimeoutMs ?? 1500);
    }
  }

  kill(): void {
    if (this.dead && !this.iframe.isConnected) return;
    this.dead = true;
    clearTimeout(this.timer);
    this.iframe.removeEventListener('load', this.onLoad);
    this.iframe.removeAttribute('srcdoc');
    this.iframe.remove();
  }
}
