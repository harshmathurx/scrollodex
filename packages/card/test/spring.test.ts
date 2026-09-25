import { describe, expect, it } from 'vitest';
import { SPRINGS, settled, stepSpring } from '../src/spring';

describe('springs', () => {
  for (const [name, s] of Object.entries(SPRINGS)) {
    it(`${name} converges without blowing up at any frame rate`, () => {
      for (const dt of [1 / 240, 1 / 120, 1 / 60, 1 / 30, 0.064]) {
        let p = 0, v = 0;
        for (let t = 0; t < 3; t += dt) {
          [p, v] = stepSpring(p, v, 1, s, dt);
          expect(Number.isFinite(p)).toBe(true);
          expect(Math.abs(p)).toBeLessThan(2);
        }
        expect(settled(p, v, 1, 1e-2)).toBe(true);
      }
    });
  }

  it('caps a single step at 64 ms so a stalled frame never explodes', () => {
    const [p] = stepSpring(0, 0, 1, SPRINGS.rubber, 5);
    expect(Number.isFinite(p)).toBe(true);
    expect(Math.abs(p)).toBeLessThan(2);
  });

  it('flip overshoots 180° by a few degrees, like card stock', () => {
    let a = 0, v = 0, max = 0;
    for (let i = 0; i < 240; i++) {
      [a, v] = stepSpring(a, v, 180, SPRINGS.flip, 1 / 120);
      max = Math.max(max, a);
    }
    expect(max - 180).toBeGreaterThan(1);
    expect(max - 180).toBeLessThan(8);
  });
});
