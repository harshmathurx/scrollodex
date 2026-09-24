export const POINTER_RE = /^https:\/\/scrollodex\.app\/x\/[A-Za-z0-9_-]{22}$/;
export const HANDLE_RE = /^[a-z0-9_]{2,24}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const DEV_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;

/**
 * The only thing a tap, QR or link may carry. Anything that isn't exactly a pointer is dropped
 * without further parsing. A dev origin is honored only when the caller passes it explicitly.
 */
export function parsePointer(s: string, opts?: { devOrigin?: string }): string | null {
  if (typeof s !== 'string' || s.length > 96) return null;
  if (POINTER_RE.test(s)) return s.slice(-22);
  const dev = opts?.devOrigin;
  if (dev && DEV_ORIGIN_RE.test(dev) && s.startsWith(dev + '/x/')) {
    const token = s.slice(dev.length + 3);
    return TOKEN_RE.test(token) ? token : null;
  }
  return null;
}
