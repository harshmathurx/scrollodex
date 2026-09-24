import type { CardMeta, Finish } from './types';

const FINISHES: readonly Finish[] = ['matte', 'gloss', 'foil', 'holo', 'emboss'];
const MASK_URI = /^data:image\/(?:webp|png);base64,[A-Za-z0-9+/]+=*$/;

/** Unknown finishes render as gloss (SCF-0 §8). */
export function normalizeFinish(f: string | undefined): Finish {
  return (FINISHES as readonly string[]).includes(f ?? '') ? (f as Finish) : 'gloss';
}

/**
 * The host-drawn finish: layers above the card frames, driven by the CSS variables
 * --sx-tx and --sx-ty (tilt, −1…1) that the stage sets on an ancestor. Only
 * background-position, opacity and mask-position change as the card tilts, so it
 * composites cheaply. With a mask, the finish lands only where the mask is opaque.
 */
export function finishLayer(meta: Pick<CardMeta, 'finish'>, maskDataUri?: string): HTMLElement {
  const finish = normalizeFinish(meta.finish);
  const root = document.createElement('div');
  root.className = 'sx-fin';
  root.dataset.finish = finish;
  root.setAttribute('aria-hidden', 'true');
  const mask = maskDataUri && MASK_URI.test(maskDataUri) ? maskDataUri : '';
  root.dataset.mask = mask ? '1' : '0';
  for (const part of ['a', 'b']) {
    const layer = document.createElement('div');
    layer.className = `sx-fin-${part}`;
    if (mask) {
      layer.style.setProperty('-webkit-mask-image', `url("${mask}")`);
      layer.style.setProperty('mask-image', `url("${mask}")`);
    }
    root.appendChild(layer);
  }
  const glare = document.createElement('div');
  glare.className = 'sx-glare';
  root.appendChild(glare);
  return root;
}
