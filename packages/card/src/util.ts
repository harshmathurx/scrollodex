export const clamp = (v: number, lo = -1, hi = 1): number => (v < lo ? lo : v > hi ? hi : v);

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export type HapticKind = 'tick' | 'light' | 'success';
const VIBRATE: Record<HapticKind, number | number[]> = { tick: 4, light: 8, success: [10, 40, 14] };

export function webHaptic(kind: HapticKind): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(VIBRATE[kind]);
  } catch {
    /* unsupported */
  }
}

type Handler = (e?: unknown) => void;
export class Emitter<E extends string> {
  private map = new Map<E, Set<Handler>>();
  on(ev: E, fn: Handler): () => void {
    let set = this.map.get(ev);
    if (!set) this.map.set(ev, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
  emit(ev: E, payload?: unknown): void {
    this.map.get(ev)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(err);
      }
    });
  }
  clear(): void {
    this.map.clear();
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: Element): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}
