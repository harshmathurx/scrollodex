import { describe, expect, it } from 'vitest';
import { canonHtml, CanonError } from '../src/index.js';
import { VECTORS } from './corpus.js';
import { textViolations, treeViolations } from './invariants.js';

describe('attack corpus', () => {
  it('has at least 150 vectors', () => {
    expect(VECTORS.length).toBeGreaterThanOrEqual(150);
  });

  for (const [i, v] of VECTORS.entries()) {
    it(`#${i} is inert: ${v.slice(0, 60)}`, () => {
      let out: string;
      try {
        out = canonHtml(v).html;
      } catch (e) {
        // Rejection is an acceptable outcome for hostile input, but only with a CanonError.
        expect(e).toBeInstanceOf(CanonError);
        return;
      }
      expect(textViolations(out), out).toEqual([]);
      expect(treeViolations(out), out).toEqual([]);
      expect(canonHtml(out).html).toBe(out);
    });
  }
});
