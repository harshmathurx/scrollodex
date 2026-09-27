import { describe, expect, it } from 'vitest';
import { canonHtml } from '@scrollodex/canon';
import { CardStage } from '../src/stage';
import { loop } from '../src/spring';
import type { VerifiedBundle } from '../src/types';

const bundle = (extra: Partial<VerifiedBundle> = {}): VerifiedBundle => ({
  digest: 'd'.repeat(64), handle: 'mika', displayName: 'Mika', html: canonHtml('<p>hi</p>').html, images: {},
  meta: { orientation: 'landscape', finish: 'gloss', fonts: [] }, ...extra,
});

/** A resting card (no tilt input, not flipped) must not carry an identity 3D transform —
 * `rotateX(0.00deg)`/`scale(1.0000)` still forces a blurred GPU-composited layer in Chromium. */
describe('CardStage: resting transform stays crisp', () => {
  it('drops to a flat transform at rest and turns off will-change', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const stage = new CardStage(root, { interactive: false, reducedMotion: false });
    stage.load(bundle());
    // Settle the loop: no tilt/flip input was ever given, so one step should already be at rest.
    stage.step(1 / 60, performance.now());
    const body = root.querySelector('.sx-body') as HTMLElement;
    expect(body.style.transform).toBe('none');
    expect(body.style.willChange).toBe('auto');
    stage.destroy();
    loop.remove(stage);
    root.remove();
  });

  it('keeps a real transform while genuinely flipped (portrait back face)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const stage = new CardStage(root, { interactive: false, reducedMotion: false });
    stage.load(bundle({ meta: { orientation: 'portrait', finish: 'gloss', fonts: [] } }));
    stage.flip();
    // Real motion: let the flip spring reach its 180° target over several frames.
    for (let i = 0; i < 120; i++) stage.step(1 / 60, performance.now());
    const body = root.querySelector('.sx-body') as HTMLElement;
    expect(body.style.transform).toContain('rotateX(180');
    stage.destroy();
    loop.remove(stage);
    root.remove();
  });
});
