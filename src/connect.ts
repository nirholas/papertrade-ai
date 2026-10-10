import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { recoverMessageAddress, type Address, type Hex } from 'viem';
import { PAPERTRADE, SESSION_TTL_SECONDS, UserFacingError } from './core/constants.js';
import { registrationTypedData, submitRegistration, verifyRegistration, type SessionCredential } from './core/intents.js';
import { domainFor, splitSignature, TYPES, type WireMessage } from './core/typed-data.js';
import { getWalletSnapshot } from './core/live.js';
import { isAddress } from './core/units.js';
import { PolicySchema, type Policy } from './policy.js';

/**
 * The connect flow shared by the hosted OAuth consent page and the local CLI login:
 *   begin  -> the server mints a fresh session key (it never leaves the server) and returns
 *             the EIP-712 RegisterSessionKey payload, or a login message for read-only mode;
 *   finish -> the wallet's signature is verified, relayed to Papertrade, and the result is a
 *             grant: the wallet, plus the session key and guardrails when trading was approved.
 */

export type ConnectMode = 'read' | 'trade';

export interface PendingConnect {
  mode: ConnectMode;
  wallet: Address;
  createdAt: number;
  /** Read-only: the exact message the wallet must sign. */
  message?: string;
  /** Trade: the generated key and the registration it must authorize. */
  sessionKey?: Hex;
  sessionAddress?: Address;
  wire?: WireMessage;
}

export interface ConnectGrant {
  mode: ConnectMode;
  wallet: Address;
  session?: SessionCredential;
  policy?: Policy;
  registrationIntentId?: string;
  /** False when the relayer accepted the registration but the wallet stream had not shown it yet. */
  sessionConfirmed?: boolean;
}

export const PENDING_TTL_SECONDS = 15 * 60;

/** JSON-safe eth_signTypedData_v4 payload (uints as decimal strings). */
export function walletTypedData(wire: WireMessage) {
  const domain = domainFor('RegisterSessionKey');
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      RegisterSessionKey: TYPES.RegisterSessionKey,
    },
    domain,
    primaryType: 'RegisterSessionKey' as const,
    message: wire,
  };
}

export function loginMessage(wallet: Address, appName: string, host: string, nonce: string, issuedAt = new Date()) {
  return [
    `${host} wants read-only access to your Papertrade account.`,
    '',
    `Wallet: ${wallet}`,
    `App: ${appName}`,
    'Access: balances, positions and history. No trading, no transfers.',
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt.toISOString()}`,
  ].join('\n');
}

function randomNonce() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function beginConnect(input: { mode: unknown; wallet: unknown; appName: string; host: string }): { pending: PendingConnect; sign: { kind: 'typedData'; typedData: ReturnType<typeof walletTypedData> } | { kind: 'message'; message: string } } {
  if (input.mode !== 'read' && input.mode !== 'trade') throw new UserFacingError('Choose read-only or trading access.', 'invalid_request');
  if (typeof input.wallet !== 'string' || !isAddress(input.wallet)) throw new UserFacingError('Connect a wallet first.', 'invalid_request');
  const wallet = input.wallet.toLowerCase() as Address;
  if (input.mode === 'read') {
    const message = loginMessage(wallet, input.appName, input.host, randomNonce());
    return { pending: { mode: 'read', wallet, createdAt: Date.now(), message }, sign: { kind: 'message', message } };
  }
  const sessionKey = generatePrivateKey();
  const sessionAddress = privateKeyToAccount(sessionKey).address.toLowerCase() as Address;
  const { wire } = registrationTypedData(wallet, sessionAddress);
  return {
    pending: { mode: 'trade', wallet, createdAt: Date.now(), sessionKey, sessionAddress, wire },
    sign: { kind: 'typedData', typedData: walletTypedData(wire) },
  };
}

async function waitForSessionKey(wallet: Address, sessionAddress: Address, timeoutMs: number, f: typeof fetch): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const snap = await getWalletSnapshot(wallet, f).catch(() => undefined);
    if (snap?.sessionKeys.some(([k]) => k.toLowerCase() === sessionAddress)) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

export async function finishConnect(pending: PendingConnect, input: { signature: unknown; policy?: unknown }, f: typeof fetch = fetch): Promise<ConnectGrant> {
  if (Date.now() - pending.createdAt > PENDING_TTL_SECONDS * 1000) throw new UserFacingError('This connect request expired. Start again.', 'expired');
  if (typeof input.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) throw new UserFacingError('The wallet did not return a valid signature.', 'invalid_signature');
  const signature = input.signature as Hex;

  if (pending.mode === 'read') {
    const signer = await recoverMessageAddress({ message: pending.message!, signature });
    if (signer.toLowerCase() !== pending.wallet) throw new UserFacingError('The signature is from a different wallet than the one connected.', 'invalid_signature');
    return { mode: 'read', wallet: pending.wallet };
  }

  const policy = PolicySchema.safeParse(input.policy);
  if (!policy.success) throw new UserFacingError('The guardrails are invalid. Check the limits and try again.', 'invalid_policy');
  const signed = { ...pending.wire!, ...splitSignature(signature) };
  const verified = await verifyRegistration(signed, pending.sessionAddress);
  if (verified.wallet !== pending.wallet) throw new UserFacingError('The signature is from a different wallet than the one connected.', 'invalid_signature');
  // The exchange only admits session keys for activated accounts (first deposit made). Say so plainly
  // instead of relaying a registration that is certain to be refused.
  const snap = await getWalletSnapshot(pending.wallet, f).catch(() => undefined);
  if (snap && BigInt(snap.lifetime.depositedRaw || '0') === 0n && BigInt(snap.balance || '0') === 0n)
    throw new UserFacingError(
      'This wallet has no Papertrade account yet, so it cannot authorize a trading key. Deposit at least 10 USDC at exchange.papertrade.xyz (your assistant can show the deposit address with get_deposit_info), then connect again. Read-only access works now.',
      'account_not_activated',
    );
  const res = await submitRegistration(signed, { fetch: f });
  const confirmed = await waitForSessionKey(pending.wallet, pending.sessionAddress!, 20_000, f);
  return {
    mode: 'trade',
    wallet: pending.wallet,
    session: { wallet: pending.wallet, sessionKey: pending.sessionKey!, sessionAddress: pending.sessionAddress!, expiry: verified.expiry },
    policy: policy.data,
    registrationIntentId: res.intentId ?? verified.intentId,
    sessionConfirmed: confirmed,
  };
}

/** Everything the browser needs to add/switch to HyperEVM before signing. */
export const HYPEREVM_WALLET_CHAIN = {
  chainId: `0x${PAPERTRADE.chainId.toString(16)}`,
  chainName: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: [PAPERTRADE.rpcUrl],
  blockExplorerUrls: [PAPERTRADE.explorerUrl],
};

export const SESSION_DAYS = Math.round(SESSION_TTL_SECONDS / 86400);
