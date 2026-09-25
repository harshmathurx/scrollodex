import {
  CANON_VERSION,
  b64u,
  bundleDigest,
  canonContact,
  canonHtml,
  contactCommit,
  ed25519,
  randomSalt,
  sha256hex,
  signingMessage,
  type Contact,
} from '@scrollodex/canon';

export const CONTACT: Contact = {
  name: { display: 'Mika Tan', sort: 'Tan, Mika' },
  title: 'Game designer',
  emails: [{ value: 'mika@example.com' }],
  a11y: { summary: 'A black card with a pixel ship.' },
};

export const RAW_HTML =
  '<!doctype html><html><head><meta name="scrollodex:finish" content="holo"><style>.n{color:#fff;font-family:"Press Start 2P",monospace}html[data-face="back"] .n{display:none}</style></head>' +
  '<body style="background:#111"><div class="n">MIKA TAN</div><img src="images/aaaaaaaaaaaa.webp" alt=""></body></html>';

export async function makeFixture(opts: { html?: string; handle?: string } = {}) {
  const handle = opts.handle ?? 'mika';
  const img = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4, 87, 69, 66, 80, 9, 9, 9]);
  const imgPath = `images/${(await sha256hex(img)).slice(0, 12)}.webp`;
  const html = opts.html ?? canonHtml(RAW_HTML, { imageMap: { 'images/aaaaaaaaaaaa.webp': imgPath } }).html;
  const htmlBytes = new TextEncoder().encode(html);
  const salt = randomSalt();
  const commit = await contactCommit(CONTACT, salt);
  const digest = await bundleDigest({ handle, files: { 'card.html': htmlBytes, [imgPath]: img }, contactCommit: commit });
  const files = { 'card.html': await sha256hex(htmlBytes), [imgPath]: await sha256hex(img), contact: commit };
  const key = await ed25519.generate();
  const signature = b64u.encode(await ed25519.sign(key.secretKey, signingMessage(digest, handle)));
  const store: Record<string, Uint8Array> = { 'card.html': htmlBytes, [imgPath]: img };
  return {
    handle, html, imgPath, store, key, salt,
    fetch: async (p: string) => {
      const b = store[p];
      if (!b) throw new Error('404');
      return b;
    },
    expected: {
      digest, files, signature, publicKey: b64u.encode(key.publicKey), handle,
      canonVersion: CANON_VERSION, displayName: 'Mika Tan',
      contact: { json: canonContact(CONTACT), salt },
    },
  };
}
