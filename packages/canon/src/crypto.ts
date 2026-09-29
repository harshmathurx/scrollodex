import * as ed from '@noble/ed25519';
import { CanonError } from './errors.js';
import { jcs } from './jcs.js';
import { CANON_VERSION, SCF_VERSION } from './limits.js';

const enc = new TextEncoder();

function bytesOf(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? enc.encode(data) : data;
}

function hex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

/** SHA-256 as lowercase hex. Files are hashed as raw bytes; strings are UTF-8 encoded first. */
export async function sha256hex(data: Uint8Array | string): Promise<string> {
  const bytes = bytesOf(data);
  return hex(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
}

export const b64u = {
  encode(b: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]!);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) throw new TypeError('b64u: invalid input');
    const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

export function randomSalt(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return b64u.encode(b);
}

export const FILE_PATH_RE = /^(?:card\.html|images\/[0-9a-f]{12}\.(?:webp|png))$/;

export async function imageName(bytes: Uint8Array): Promise<string> {
  const h = await sha256hex(bytes);
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return `images/${h.slice(0, 12)}.${isPng ? 'png' : 'webp'}`;
}

/**
 * digest = sha256hex(jcs({ scf, canon, handle, files })) where files maps card.html and images/* to
 * sha256hex of their raw bytes, plus `contact` → contact_commit.
 */
export async function bundleDigest(input: {
  handle: string;
  files: Record<string, Uint8Array>;
  contactCommit: string;
}): Promise<string> {
  const files: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(input.files)) {
    if (!FILE_PATH_RE.test(path)) throw new CanonError('bundle.bad_path', `not a bundle path: ${path}`);
    files[path] = await sha256hex(bytes);
  }
  if (!('card.html' in files)) throw new CanonError('bundle.bad_path', 'card.html is required');
  if (!/^[0-9a-f]{64}$/.test(input.contactCommit)) throw new CanonError('bundle.bad_path', 'bad contact commit');
  files.contact = input.contactCommit;
  return sha256hex(jcs({ scf: SCF_VERSION, canon: CANON_VERSION, handle: input.handle, files }));
}

/** Same digest from already-hashed files (as stored in the database). */
export async function digestFromHashes(input: { handle: string; files: Record<string, string> }): Promise<string> {
  for (const [path, h] of Object.entries(input.files)) {
    if (path !== 'contact' && !FILE_PATH_RE.test(path)) throw new CanonError('bundle.bad_path', `not a bundle path: ${path}`);
    if (!/^[0-9a-f]{64}$/.test(h)) throw new CanonError('bundle.bad_path', `bad hash for ${path}`);
  }
  return sha256hex(jcs({ scf: SCF_VERSION, canon: CANON_VERSION, handle: input.handle, files: input.files }));
}

export function signingMessage(digest: string, handle: string): string {
  return `scrollodex-card-v0\n${digest}\n${handle}`;
}

export function keyProofMessage(userId: string, publicKeyB64u: string): string {
  return `scrollodex-key-v0\n${userId}\n${publicKeyB64u}`;
}

/** Signed by an already-active key to approve a pending one (trust layer v1, D-next). Binds the
 * user and the exact pending public key, so a replayed signature can only ever approve that one
 * key, for that one account. */
export function approveMessage(userId: string, pendingPublicKeyB64u: string): string {
  return `scrollodex-approve-v0\n${userId}\n${pendingPublicKeyB64u}`;
}

/** 32 bytes, a valid curve point, and not of small order. */
export function isValidPublicKey(publicKeyRaw: Uint8Array): boolean {
  if (!(publicKeyRaw instanceof Uint8Array) || publicKeyRaw.length !== 32) return false;
  try {
    const p = ed.Point.fromBytes(publicKeyRaw, false);
    return !p.isSmallOrder();
  } catch {
    return false;
  }
}

/** Strict RFC 8032 verification (noble, zip215: false), identical in every runtime. */
export async function verifyEd25519(publicKeyRaw: Uint8Array, message: string, signature: Uint8Array): Promise<boolean> {
  if (!isValidPublicKey(publicKeyRaw) || !(signature instanceof Uint8Array) || signature.length !== 64) return false;
  try {
    return await ed.verifyAsync(signature, enc.encode(message), publicKeyRaw, { zip215: false });
  } catch {
    return false;
  }
}

/** Fallback signer for runtimes without WebCrypto Ed25519. The secret key is 32 raw bytes. */
export const ed25519 = {
  async generate(): Promise<{ secretKey: Uint8Array; publicKey: Uint8Array }> {
    const secretKey = ed.utils.randomSecretKey();
    return { secretKey, publicKey: await ed.getPublicKeyAsync(secretKey) };
  },
  async sign(secretKey: Uint8Array, message: string): Promise<Uint8Array> {
    return ed.signAsync(enc.encode(message), secretKey);
  },
  async publicKey(secretKey: Uint8Array): Promise<Uint8Array> {
    return ed.getPublicKeyAsync(secretKey);
  },
};
