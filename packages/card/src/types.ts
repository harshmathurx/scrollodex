import type { CardMeta, Finish } from '@scrollodex/canon';

export type { CardMeta, Finish };

export interface VerifiedBundle {
  digest: string;
  handle: string;
  displayName: string;
  /** Canonical card.html, already verified. */
  html: string;
  /** 'images/<hash12>.webp' → data: URI of the verified bytes. */
  images: Record<string, string>;
  meta: CardMeta;
}

export type Face = 'front' | 'back';
export type CardState = 'placeholder' | 'live' | 'fallback' | 'killed';
