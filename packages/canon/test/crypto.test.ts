import { describe, expect, it } from 'vitest';
import { approveMessage, b64u, ed25519, keyProofMessage, verifyEd25519 } from '../src/index.js';

describe('approveMessage (trust layer v1, SEAL-SPEC.md)', () => {
  it('binds the exact user id and pending public key, in a fixed format', () => {
    expect(approveMessage('user-1', 'pending-pub')).toBe('scrollodex-approve-v0\nuser-1\npending-pub');
  });

  it('differs from keyProofMessage for the same inputs, so one can never be replayed as the other', () => {
    const proof = keyProofMessage('user-1', 'pub-a');
    const approve = approveMessage('user-1', 'pub-a');
    expect(proof).not.toBe(approve);
  });

  it('changes with either the user id or the public key, so a signature over it cannot be replayed for a different account or a different pending key', () => {
    const base = approveMessage('user-1', 'pub-a');
    expect(approveMessage('user-2', 'pub-a')).not.toBe(base);
    expect(approveMessage('user-1', 'pub-b')).not.toBe(base);
  });

  it('a signature over it verifies only against the signing key and only for that exact message', async () => {
    const approver = await ed25519.generate();
    const other = await ed25519.generate();
    const message = approveMessage('user-1', 'pending-pub-key');
    const sig = await ed25519.sign(approver.secretKey, message);

    expect(await verifyEd25519(approver.publicKey, message, sig)).toBe(true);
    expect(await verifyEd25519(other.publicKey, message, sig)).toBe(false);
    expect(await verifyEd25519(approver.publicKey, approveMessage('user-1', 'a-different-pending-key'), sig)).toBe(false);
    expect(await verifyEd25519(approver.publicKey, approveMessage('user-2', 'pending-pub-key'), sig)).toBe(false);
  });

  it('round-trips through b64u exactly as register_key/approve_key send it over the wire', async () => {
    const approver = await ed25519.generate();
    const pendingPub = b64u.encode(new Uint8Array(32).fill(7));
    const message = approveMessage('11111111-1111-4111-8111-111111111111', pendingPub);
    const sig = await ed25519.sign(approver.secretKey, message);
    const sigWire = b64u.encode(sig);
    expect(await verifyEd25519(approver.publicKey, message, b64u.decode(sigWire))).toBe(true);
  });
});
