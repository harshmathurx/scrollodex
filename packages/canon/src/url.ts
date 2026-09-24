import { IMAGE_REF_RE } from './limits.js';

export type UrlClass =
  | { kind: 'image'; ref: string }
  | { kind: 'fragment'; id: string }
  | { kind: 'external'; url: string }
  | { kind: 'data'; uri: string; mime: string }
  | { kind: 'missing'; ref: string }
  | { kind: 'bad' };

const DATA_RE = /^data:(image\/(?:png|jpeg|jpg|webp|gif|avif|svg\+xml))(?:;[a-z0-9=._-]+)*(;base64)?,/i;
const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;

/** Strip ASCII whitespace at the ends and control characters/whitespace anywhere before the first ':' or '/' */
export function normalizeUrl(raw: string): string {
  let v = raw.replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
  v = v.replace(/[\u0000-\u001f\u007f]/g, '');
  return v;
}

/** ids survive only in the plain form; they are never rewritten. */
export function validId(id: string): string | null {
  return ID_RE.test(id) ? id : null;
}

/**
 * Classify a URL-bearing value. `imageMap` rewrites happen before this is called.
 * `allowFragment` is true in SVG/CSS contexts where url(#id) is meaningful.
 */
export function classifyUrl(raw: string, allowFragment: boolean): UrlClass {
  const v = normalizeUrl(raw);
  if (IMAGE_REF_RE.test(v)) return { kind: 'image', ref: v };
  if (allowFragment && v.startsWith('#')) {
    const id = validId(v.slice(1));
    return id ? { kind: 'fragment', id } : { kind: 'bad' };
  }
  const m = DATA_RE.exec(v);
  if (m) return { kind: 'data', uri: v, mime: m[1]!.toLowerCase().replace('jpg', 'jpeg') };
  if (/^data:/i.test(v)) return { kind: 'bad' };
  // Relative refs into images/ that aren't canonical names: the caller forgot to map them.
  if (/^(?:\.\/)?images\//i.test(v)) return { kind: 'missing', ref: v };
  let parsed: URL;
  try {
    parsed = new URL(v, 'https://card.invalid/');
  } catch {
    return { kind: 'bad' };
  }
  if (parsed.protocol === 'https:' && parsed.hostname !== 'card.invalid' && !parsed.username && !parsed.password) {
    const host = parsed.hostname;
    const ipLiteral = /^\d+(?:\.\d+){3}$/.test(host) || host.startsWith('[');
    if (!ipLiteral && (parsed.port === '' || parsed.port === '443')) return { kind: 'external', url: parsed.href };
  }
  return { kind: 'bad' };
}

export function decodeDataUri(uri: string): Uint8Array | null {
  const comma = uri.indexOf(',');
  if (comma < 0) return null;
  const header = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  try {
    if (/;base64$/i.test(header)) {
      const bin = atob(payload.replace(/\s+/g, ''));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new TextEncoder().encode(decodeURIComponent(payload));
  } catch {
    return null;
  }
}
