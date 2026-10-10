import { describe, expect, it, vi } from 'vitest';
import { seal, unseal } from '../src/seal.js';

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';

describe('seal', () => {
  it('round-trips a value', async () => {
    const t = await seal(SECRET, 'p', { a: 1, b: 'x' }, 60, 'aad');
    expect(await unseal(SECRET, 'p', t, 'aad')).toEqual({ a: 1, b: 'x' });
  });

  it('rejects a different purpose, AAD or secret', async () => {
    const t = await seal(SECRET, 'p', 1, 60, 'aad');
    await expect(unseal(SECRET, 'other', t, 'aad')).rejects.toThrow(/could not be verified/);
    await expect(unseal(SECRET, 'p', t, 'different')).rejects.toThrow(/could not be verified/);
    await expect(unseal(`${SECRET}x`, 'p', t, 'aad')).rejects.toThrow(/could not be verified/);
  });

  it('rejects tampering and garbage', async () => {
    const t = await seal(SECRET, 'p', 1, 60);
    const flipped = t.slice(0, -2) + (t.at(-2) === 'A' ? 'B' : 'A') + t.at(-1);
    await expect(unseal(SECRET, 'p', flipped)).rejects.toThrow();
    await expect(unseal(SECRET, 'p', 'nope')).rejects.toThrow(/missing its security token/);
    await expect(unseal(SECRET, 'p', undefined)).rejects.toThrow(/missing its security token/);
  });

  it('expires', async () => {
    const t = await seal(SECRET, 'p', 1, 10);
    vi.useFakeTimers({ now: Date.now() + 11_000 });
    try {
      await expect(unseal(SECRET, 'p', t)).rejects.toThrow(/expired/);
    } finally {
      vi.useRealTimers();
    }
  });
});
