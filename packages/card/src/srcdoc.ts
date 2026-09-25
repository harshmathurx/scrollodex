import type { VerifiedBundle } from './types';

import { CARD_CSP } from '@scrollodex/canon';

export { CARD_CSP };

export const CARD_SIZE = {
  landscape: { w: 700, h: 400 },
  portrait: { w: 400, h: 700 },
} as const;

export class SrcdocError extends Error {
  constructor(readonly code: 'srcdoc.script' | 'srcdoc.structure', message: string) {
    super(message);
    this.name = 'SrcdocError';
  }
}

const IMAGE_REF = /images\/[0-9a-f]{12}\.(?:webp|png)/g;
const DATA_URI = /^data:(?:image\/(?:webp|png|jpeg|gif|avif)|font\/woff2?);base64,[A-Za-z0-9+/]+=*$/;
const FORBIDDEN_TAG = /<\s*\/?\s*(?:script|iframe|object|embed|frame|frameset|base|form|link|portal)\b/i;
const FORBIDDEN_ATTR = /<[^>]*\s(?:on[a-z]+|srcdoc|formaction)\s*=/i;
const FORBIDDEN_URL = /(?:\s(?:href|src|srcset|xlink:href|action|formaction|data)\s*=\s*["']?|url\(\s*["']?)\s*(?:javascript|vbscript):/i;
const FAMILY = /^[A-Za-z0-9 ]{1,40}$/;

function pick(html: string, re: RegExp): RegExpMatchArray | null {
  return html.match(re);
}

/** Keeps only attributes on <html>/<body> that can't carry behaviour, and drops any data-face the author tried to set. */
function cleanRootAttrs(attrs: string): string {
  const out: string[] = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs))) {
    const name = m[1].toLowerCase();
    if (name === 'data-face' || name.startsWith('on') || !/^(?:lang|dir|class|style|data-[a-z0-9-]+)$/.test(name)) continue;
    const raw = m[2] ?? '""';
    const val = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
    out.push(`${name}="${val.replace(/"/g, '&quot;')}"`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}

function fontFaces(families: readonly string[], fonts: Record<string, string>): string {
  let css = '';
  for (const fam of families) {
    const uri = fonts[fam];
    if (!uri || !FAMILY.test(fam) || !DATA_URI.test(uri)) continue;
    css += `@font-face{font-family:"${fam}";src:url(${uri}) format("woff2");font-display:block}`;
  }
  return css;
}

/**
 * Builds the frame document for one face of a verified card.
 * - The CSP meta is the first child of <head>; library @font-face rules follow it, before the author's styles.
 * - The back face gets <html data-face="back">; the front gets no data-face.
 * - images/<hash12>.webp references become data: URIs of the verified bytes.
 * - Library fonts become data: @font-face rules.
 * - still: animations off (for decks, where only the front card is live).
 * Never emits script: the output is checked before it is returned.
 */
export interface SrcdocOptions {
  /** Snapshot mode: animations and transitions off, so the card shows its resting state. */
  still?: boolean;
}

export function buildSrcdoc(
  b: VerifiedBundle,
  face: 'front' | 'back',
  fonts: Record<string, string> = {},
  opts: SrcdocOptions = {},
): string {
  const html = b.html.replace(/^﻿/, '');
  const htmlTag = pick(html, /<html\b([^>]*)>/i);
  const head = pick(html, /<head\b[^>]*>([\s\S]*?)<\/head>/i);
  const body = pick(html, /<body\b([^>]*)>([\s\S]*?)<\/body>/i);

  let headInner: string;
  let bodyAttrs = '';
  let bodyInner: string;
  if (head || body) {
    headInner = head ? head[1] : '';
    bodyAttrs = body ? cleanRootAttrs(body[1]) : '';
    if (body) bodyInner = body[2];
    else throw new SrcdocError('srcdoc.structure', 'Card has a <head> but no <body>.');
  } else {
    headInner = '';
    bodyInner = html.replace(/<!doctype[^>]*>/i, '').replace(/<\/?html\b[^>]*>/gi, '');
  }

  const inline = (s: string): string => s.replace(IMAGE_REF, (ref) => {
    const uri = b.images[ref];
    return uri && DATA_URI.test(uri) ? uri : ref;
  });
  headInner = inline(headInner);
  bodyInner = inline(bodyInner);

  const size = CARD_SIZE[b.meta.orientation === 'portrait' ? 'portrait' : 'landscape'];
  const base =
    `html,body{margin:0;padding:0;width:${size.w}px;height:${size.h}px;overflow:hidden}` +
    'body{position:relative}' +
    '*,*::before,*::after{cursor:default!important}';
  const faces = fontFaces(b.meta.fonts ?? [], fonts);
  const rootAttrs = cleanRootAttrs(htmlTag ? htmlTag[1] : '') + (face === 'back' ? ' data-face="back"' : '');

  const doc =
    `<!doctype html><html${rootAttrs}><head>` +
    `<meta http-equiv="Content-Security-Policy" content="${CARD_CSP.replace(/"/g, '&quot;')}">` +
    (faces ? `<style>${faces}</style>` : '') +
    '<meta charset="utf-8">' +
    '<meta name="referrer" content="no-referrer">' +
    `<style>${base}</style>` +
    headInner +
    (opts.still ? '<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>' : '') +
    `</head><body${bodyAttrs}>${bodyInner}</body></html>`;

  // Defence in depth over canon's output. Quoted attribute values are inert text, so blank them
  // before looking for tags and handler attributes; URL schemes are checked in real URL slots only.
  const scan = doc.replace(/url\(data:[^)]*\)|data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/gi, '');
  const structural = scan.replace(/="[^"]*"/g, '=""');
  if (FORBIDDEN_TAG.test(structural) || FORBIDDEN_ATTR.test(structural) || FORBIDDEN_URL.test(scan)) throw new SrcdocError('srcdoc.script', 'Refusing to build a frame document containing active content.');
  return doc;
}
