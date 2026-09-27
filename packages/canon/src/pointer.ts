export const POINTER_RE = /^https:\/\/scrollodex\.app\/x\/[A-Za-z0-9_-]{22}$/;
export const HANDLE_RE = /^[a-z0-9_]{2,24}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const DEV_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;
const APP_ORIGIN_RE = /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

/**
 * The only thing a tap, QR or link may carry. Anything that isn't exactly a pointer is dropped
 * without further parsing. Another origin is honored only when the host passes it explicitly:
 * `appOrigin` is the host's own public HTTPS origin, and `devOrigin` a localhost origin.
 */
export function parsePointer(s: string, opts?: { devOrigin?: string; appOrigin?: string }): string | null {
  if (typeof s !== 'string' || s.length > 96) return null;
  if (POINTER_RE.test(s)) return s.slice(-22);
  for (const [origin, re] of [[opts?.appOrigin, APP_ORIGIN_RE], [opts?.devOrigin, DEV_ORIGIN_RE]] as const) {
    if (origin && re.test(origin) && s.startsWith(origin + '/x/')) {
      const token = s.slice(origin.length + 3);
      return TOKEN_RE.test(token) ? token : null;
    }
  }
  return null;
}
