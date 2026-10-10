import { describe, expect, it } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { beginConnect, finishConnect } from '../src/connect.js';
import { verifyRegistration } from '../src/core/intents.js';
import { splitSignature } from '../src/core/typed-data.js';

const owner = privateKeyToAccount(generatePrivateKey());
const wallet = owner.address.toLowerCase();

describe('read-only connect', () => {
  it('grants read access for a valid login signature', async () => {
    const { pending, sign } = beginConnect({ mode: 'read', wallet, appName: 'Test', host: 'example.com' });
    expect(sign.kind).toBe('message');
    const signature = await owner.signMessage({ message: (sign as { message: string }).message });
    await expect(finishConnect(pending, { signature })).resolves.toEqual({ mode: 'read', wallet });
  });

  it('refuses a signature from another wallet', async () => {
    const { pending, sign } = beginConnect({ mode: 'read', wallet, appName: 'Test', host: 'example.com' });
    const other = privateKeyToAccount(generatePrivateKey());
    const signature = await other.signMessage({ message: (sign as { message: string }).message });
    await expect(finishConnect(pending, { signature })).rejects.toThrow(/different wallet/);
  });

  it('validates its inputs', () => {
    expect(() => beginConnect({ mode: 'admin', wallet, appName: 'T', host: 'h' })).toThrow(/read-only or trading/);
    expect(() => beginConnect({ mode: 'read', wallet: '0x123', appName: 'T', host: 'h' })).toThrow(/Connect a wallet/);
  });
});

describe('trading connect', () => {
  it('produces wallet-ready EIP-712 that the server verifies against the generated key', async () => {
    const { pending, sign } = beginConnect({ mode: 'trade', wallet, appName: 'Test', host: 'example.com' });
    expect(sign.kind).toBe('typedData');
    if (sign.kind !== 'typedData') return;
    // What eth_signTypedData_v4 receives must survive a JSON round trip (uints as decimal strings).
    const td = JSON.parse(JSON.stringify(sign.typedData));
    expect(td.domain.name).toBe('String');
    expect(td.message.key).toBe(pending.sessionAddress);
    const { EIP712Domain: _, ...types } = td.types;
    const signature = await owner.signTypedData({ domain: { ...td.domain, chainId: Number(td.domain.chainId) }, types, primaryType: td.primaryType, message: td.message });
    const verified = await verifyRegistration({ ...pending.wire!, ...splitSignature(signature as Hex) }, pending.sessionAddress);
    expect(verified.wallet).toBe(wallet);
    expect(verified.sessionAddress).toBe(pending.sessionAddress);
    expect(verified.expiry).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
    expect(privateKeyToAccount(pending.sessionKey!).address.toLowerCase()).toBe(pending.sessionAddress);
  });

  it('rejects a registration that authorizes a different key', async () => {
    const a = beginConnect({ mode: 'trade', wallet, appName: 'Test', host: 'example.com' });
    const b = beginConnect({ mode: 'trade', wallet, appName: 'Test', host: 'example.com' });
    if (a.sign.kind !== 'typedData') return;
    const td = JSON.parse(JSON.stringify(a.sign.typedData));
    const { EIP712Domain: _, ...types } = td.types;
    const signature = await owner.signTypedData({ domain: { ...td.domain, chainId: Number(td.domain.chainId) }, types, primaryType: td.primaryType, message: td.message });
    await expect(verifyRegistration({ ...a.pending.wire!, ...splitSignature(signature as Hex) }, b.pending.sessionAddress)).rejects.toThrow(/different session key/);
  });
});
