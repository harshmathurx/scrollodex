import {
  CANON_VERSION,
  b64u,
  canonContact,
  canonHtml,
  contactCommit,
  type Contact,
  jcs,
  sha256hex,
  signingMessage,
  verifyEd25519,
} from '@scrollodex/canon';
import type { VerifiedBundle } from './types';

export type VerifyErrorCode =
  | 'verify.files'          // the file list is malformed or names something unexpected
  | 'verify.fetch'          // a listed file couldn't be fetched
  | 'verify.hash'           // a file's bytes don't match its listed hash
  | 'verify.digest'         // the listed hashes don't produce the claimed digest
  | 'verify.signature'      // the Ed25519 signature doesn't cover this digest and handle
  | 'verify.contact'        // the contact doesn't match its commitment
  | 'verify.canon'          // card.html isn't canonical for its own canon version (tampered, or a canon bug)
  | 'verify.size';          // the bundle is over the D6 limits

export class VerifyError extends Error {
  constructor(readonly code: VerifyErrorCode, message: string) {
    super(message);
    this.name = 'VerifyError';
  }
}

export interface VerifyExpected {
  digest: string;
  /** 'card.html' and 'images/<hash12>.webp' → sha256hex; 'contact' → contact_commit. */
  files: Record<string, string>;
  /** Ed25519 signature, b64url. */
  signature: string;
  /** Raw 32-byte Ed25519 public key, b64url. */
  publicKey: string;
  handle: string;
  /** The canon version the card was published under (card_versions.canon_version). */
  canonVersion: number;
  displayName?: string;
  /** Full-scope redeems only: the contact as canonical JSON (JCS) and its salt, checked against files.contact. */
  contact?: { json: string; salt: string };
}

const HEX64 = /^[0-9a-f]{64}$/;
const FILE = /^(?:card\.html|images\/[0-9a-f]{12}\.(?:webp|png))$/;
const MAX_HTML = 51200;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 307200;

function dataUri(path: string, bytes: Uint8Array): string {
  const mime = path.endsWith('.png') ? 'image/png' : 'image/webp';
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

/**
 * Fetches every file of a card, checks it byte for byte, and returns something safe to render.
 * 1. Every file's bytes hash to the value in `files`.
 * 2. The digest recomputes as sha256hex(jcs({scf: 0, canon, handle, files})).
 * 3. The Ed25519 signature covers signingMessage(digest, handle).
 * 4. With a contact, its commitment recomputes and matches files.contact.
 * 5. card.html is re-canonicalized on this device (lock 3). Under the same canon version the
 *    output must be byte-identical; under an older version the fresh canonical output is rendered.
 * Only then are images inlined as data: URIs of the verified bytes.
 */
export async function verifyAndInline(
  fetchBytes: (path: string) => Promise<Uint8Array>,
  expected: VerifyExpected,
): Promise<VerifiedBundle> {
  const { files, handle } = expected;
  if (!files || typeof files !== 'object' || !HEX64.test(expected.digest) || !Number.isInteger(expected.canonVersion)) throw new VerifyError('verify.files', 'Malformed card record.');
  const paths = Object.keys(files);
  const assets = paths.filter((p) => p !== 'contact');
  if (!assets.includes('card.html')) throw new VerifyError('verify.files', 'The card has no card.html.');
  for (const p of assets) {
    if (!FILE.test(p) || !HEX64.test(files[p])) throw new VerifyError('verify.files', `Unexpected file ${p}.`);
  }
  if ('contact' in files && !HEX64.test(files.contact)) throw new VerifyError('verify.files', 'Malformed contact commitment.');
  if (assets.length - 1 > MAX_IMAGES) throw new VerifyError('verify.size', 'Too many images.');

  const digest = await sha256hex(jcs({ scf: 0, canon: expected.canonVersion, handle, files }));
  if (digest !== expected.digest) throw new VerifyError('verify.digest', 'The file list does not match the card digest.');

  let sigOk = false;
  try {
    sigOk = await verifyEd25519(b64u.decode(expected.publicKey), signingMessage(digest, handle), b64u.decode(expected.signature));
  } catch {
    sigOk = false;
  }
  if (!sigOk) throw new VerifyError('verify.signature', 'The signature does not match this card.');

  if (expected.contact) {
    let commit: string;
    try {
      const parsed = JSON.parse(expected.contact.json) as Contact;
      if (canonContact(parsed) !== expected.contact.json) throw new Error('not canonical');
      commit = await contactCommit(parsed, expected.contact.salt);
    } catch {
      throw new VerifyError('verify.contact', 'The contact is malformed.');
    }
    if (commit !== files.contact) throw new VerifyError('verify.contact', 'The contact does not match what the author signed.');
  }

  const bytes: Record<string, Uint8Array> = {};
  let imageBytes = 0;
  await Promise.all(
    assets.map(async (p) => {
      let b: Uint8Array;
      try {
        b = await fetchBytes(p);
      } catch {
        throw new VerifyError('verify.fetch', `Couldn't fetch ${p}.`);
      }
      if ((await sha256hex(b)) !== files[p]) throw new VerifyError('verify.hash', `${p} was altered.`);
      bytes[p] = b;
    }),
  );
  for (const p of assets) if (p !== 'card.html') imageBytes += bytes[p].length;
  if (bytes['card.html'].length > MAX_HTML || imageBytes > MAX_IMAGE_BYTES) throw new VerifyError('verify.size', 'The card is over the size limits.');

  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes['card.html']);
  } catch {
    throw new VerifyError('verify.canon', 'card.html is not valid UTF-8.');
  }
  let canon;
  try {
    canon = canonHtml(raw);
  } catch {
    throw new VerifyError('verify.canon', 'card.html could not be re-canonicalized.');
  }
  if (expected.canonVersion === CANON_VERSION && canon.html !== raw) {
    throw new VerifyError('verify.canon', 'card.html is not canonical on this device.');
  }

  const images: Record<string, string> = {};
  for (const p of assets) if (p !== 'card.html') images[p] = dataUri(p, bytes[p]);
  return {
    digest,
    handle,
    displayName: expected.displayName ?? handle,
    html: canon.html,
    images,
    meta: canon.meta,
  };
}
