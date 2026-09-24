/** A damped spring, given as stiffness / damping / mass (mass 1). */
export interface Spring {
  k: number;
  c: number;
}

export const SPRINGS = {
  tilt: { k: 170, c: 20 },
  recentre: { k: 120, c: 14 },
  flip: { k: 200, c: 22 },
  flick: { k: 260, c: 24 },
  snap: { k: 200, c: 26 },
  jump: { k: 220, c: 26 },
  rubber: { k: 300, c: 30 },
} as const satisfies Record<string, Spring>;

const SUBSTEP = 1 / 240;

/**
 * Advances a spring by dt seconds with semi-implicit Euler at a fixed 240 Hz substep,
 * so stiff springs stay stable on slow frames.
 */
export function stepSpring(pos: number, vel: number, target: number, s: Spring, dt: number): [number, number] {
  let t = Math.min(dt, 0.064);
  while (t > 1e-9) {
    const h = Math.min(SUBSTEP, t);
    vel += (s.k * (target - pos) - s.c * vel) * h;
    pos += vel * h;
    t -= h;
  }
  return [pos, vel];
}

export function settled(pos: number, vel: number, target: number, eps = 1e-3): boolean {
  return Math.abs(vel) < eps && Math.abs(target - pos) < eps;
}

export interface Steppable {
  /** Returns true while it wants more frames. */
  step(dt: number, now: number): boolean;
}

/** One shared rAF loop. Runs only while something is moving or visible-and-animating. */
class Loop {
  private set = new Set<Steppable>();
  private raf = 0;
  private last = 0;

  add(o: Steppable): void {
    this.set.add(o);
    if (!this.raf && typeof requestAnimationFrame === 'function') {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  remove(o: Steppable): void {
    this.set.delete(o);
  }

  private tick = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000)) || 1 / 60;
    this.last = now;
    for (const o of [...this.set]) {
      let more = false;
      try {
        more = o.step(dt, now);
      } catch (err) {
        console.error(err);
      }
      if (!more) this.set.delete(o);
    }
    this.raf = this.set.size ? requestAnimationFrame(this.tick) : 0;
  };
}

export const loop = new Loop();
