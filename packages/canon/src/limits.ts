export const SCF_VERSION = 0;
/** Integer version of the canonicalizer. Any change to canonical output bytes bumps it. */
export const CANON_VERSION = 1;

/** The single card-document CSP (D11). Nothing can execute and nothing can load except inlined data. */
export const CARD_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'";

export const LIMITS = {
  htmlUploadBytes: 51200,
  images: 6,
  imagesTotalBytes: 307200,
  imageMaxPx: 1600,
  elements: 3000,
  depth: 48,
  keyframes: 100,
  filters: 20,
} as const;

export type Finish = 'matte' | 'gloss' | 'foil' | 'holo' | 'emboss';
export const FINISHES: readonly Finish[] = ['matte', 'gloss', 'foil', 'holo', 'emboss'];

export interface CardMeta {
  orientation: 'landscape' | 'portrait';
  finish: Finish;
  finishMask?: string;
  background?: string;
  fonts: string[];
}

export const FONT_LIBRARY = [
  'Instrument Serif',
  'Fraunces',
  'Playfair Display',
  'Bodoni Moda',
  'Cormorant',
  'EB Garamond',
  'Libre Caslon Text',
  'Space Grotesk',
  'Syne',
  'Inter',
  'DM Sans',
  'Archivo Black',
  'IBM Plex Mono',
  'JetBrains Mono',
  'VT323',
  'Press Start 2P',
  'Caveat',
  'Pinyon Script',
] as const;

export const IMAGE_REF_RE = /^images\/[0-9a-f]{12}\.(?:webp|png)$/;
