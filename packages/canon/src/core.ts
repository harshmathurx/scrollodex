/**
 * The light half of canon (12-libraries.md "Split canon's entry points"). Everything the Deck and
 * the card renderer need to verify a bundle and inline its bytes, with NO parse5 or css-tree: those
 * only load with the full `canonHtml`/`isCanonical` re-canonicalizer, which stays out of this entry
 * so the first route's dependency graph never pulls in an HTML/CSS parser.
 *
 * Import this as `@scrollodex/canon/core`. The full `@scrollodex/canon` re-exports everything here
 * too, so anything already using the full package keeps working unchanged.
 */
export { SCF_VERSION, CANON_VERSION, CARD_CSP, LIMITS, IMAGE_REF_RE } from './limits.js';
export type { Finish, CardMeta } from './limits.js';
export { CanonError } from './errors.js';
export type { CanonErrorCode } from './errors.js';
export { validateContact, canonContact, contactCommit } from './contact.js';
export type { Contact } from './contact.js';
export { jcs } from './jcs.js';
export {
  sha256hex,
  b64u,
  randomSalt,
  imageName,
  bundleDigest,
  digestFromHashes,
  signingMessage,
  keyProofMessage,
  isValidPublicKey,
  verifyEd25519,
  ed25519,
  FILE_PATH_RE,
} from './crypto.js';
export { POINTER_RE, HANDLE_RE, parsePointer } from './pointer.js';
