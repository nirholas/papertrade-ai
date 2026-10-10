import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress, zeroAddress, type Address, type Hex } from 'viem';
import { MAX_CLOSE_BATCH, INTENT_TTL_SECONDS, SESSION_TTL_SECONDS, UserFacingError } from './constants.js';
import { postIntent, type HttpOptions, type IntentResponse } from './http.js';
import { deadlineIn, freshNonce, signIntent, toWireMessage, typedDataFor, intentIdOf, digestOf, type SignedIntent } from './typed-data.js';

/** A delegated trading key: can open, close and cancel for `wallet`, and nothing else. */
export interface SessionCredential {
  wallet: Address;
  sessionKey: Hex;
  sessionAddress: Address;
  /** Unix seconds. */
  expiry: number;
}

/** The typed data a wallet signs to authorize a session key. Rendered by the connect page. */
export function registrationTypedData(wallet: Address, sessionAddress: Address, nowMs = Date.now()) {
  const wire = toWireMessage('RegisterSessionKey', {
    user: wallet,
    key: sessionAddress,
    expiry: deadlineIn(SESSION_TTL_SECONDS, nowMs),
    feeAddress: zeroAddress,
    nonce: freshNonce(),
    deadline: deadlineIn(INTENT_TTL_SECONDS, nowMs),
  });
  return { wire, typedData: typedDataFor('RegisterSessionKey', wire) };
}

/** Verify a wallet-signed registration before relaying it: right types, signer is the user, not expired. */
export async function verifyRegistration(signed: SignedIntent, expectedKey?: Address) {
  const wire = toWireMessage('RegisterSessionKey', signed);
  const signature = `0x${signed.r.slice(2)}${signed.s.slice(2)}${Number(signed.v).toString(16).padStart(2, '0')}` as Hex;
  const signer = await recoverTypedDataAddress({ ...(typedDataFor('RegisterSessionKey', wire) as Parameters<typeof recoverTypedDataAddress>[0]), signature });
  if (signer.toLowerCase() !== String(wire.user).toLowerCase()) throw new UserFacingError('The registration signature does not match the connected wallet.', 'invalid_signature');
  if (expectedKey && String(wire.key).toLowerCase() !== expectedKey.toLowerCase()) throw new UserFacingError('The registration authorizes a different session key.', 'invalid_signature');
  const now = Math.floor(Date.now() / 1000);
  if (Number(wire.deadline) <= now) throw new UserFacingError('The registration signature expired. Sign again.', 'deadline_expired');
  if (Number(wire.expiry) <= now) throw new UserFacingError('The session expiry is in the past.', 'invalid_request');
  return { wallet: signer.toLowerCase() as Address, sessionAddress: String(wire.key).toLowerCase() as Address, expiry: Number(wire.expiry), intentId: intentIdOf(digestOf('RegisterSessionKey', wire), signer) };
}

export async function submitRegistration(signed: SignedIntent, http?: HttpOptions): Promise<IntentResponse> {
  return postIntent('/intents', { action: 'registerSessionKey', signed }, http);
}

function sessionSigner(session: SessionCredential) {
  const account = privateKeyToAccount(session.sessionKey);
  if (account.address.toLowerCase() !== session.sessionAddress.toLowerCase()) throw new UserFacingError('Stored session key is corrupt. Reconnect your wallet.', 'session_invalid');
  if (session.expiry * 1000 <= Date.now()) throw new UserFacingError('Your trading session expired. Reconnect your wallet to start a new one.', 'session_expired');
  return account;
}

export interface OpenArgs {
  instrumentId: number;
  isLong: boolean;
  marginWad: bigint;
  leverage: number;
}

export async function openPosition(session: SessionCredential, args: OpenArgs, http?: HttpOptions) {
  const signer = sessionSigner(session);
  const { signed, intentId } = await signIntent(signer, 'OpenPosition', {
    user: session.wallet,
    instrumentId: args.instrumentId,
    isLong: args.isLong,
    size: args.marginWad,
    leverage: args.leverage,
    useDebt: false,
    nonce: freshNonce(),
    deadline: deadlineIn(INTENT_TTL_SECONDS),
  });
  const res = await postIntent('/intents', { action: 'openPosition', signed }, http);
  return { ...res, intentId: res.intentId ?? intentId };
}

/** Close up to any number of positions; the relayer takes 12 per intent so larger lists are batched. */
export async function closePositions(session: SessionCredential, positionIds: (string | bigint)[], http?: HttpOptions) {
  const signer = sessionSigner(session);
  const results: IntentResponse[] = [];
  for (let i = 0; i < positionIds.length; i += MAX_CLOSE_BATCH) {
    const batch = positionIds.slice(i, i + MAX_CLOSE_BATCH).map((p) => BigInt(p));
    const { signed, intentId } = await signIntent(signer, 'Close', {
      user: session.wallet,
      positionIds: batch,
      nonce: freshNonce(),
      deadline: deadlineIn(INTENT_TTL_SECONDS),
    });
    const res = await postIntent('/intents', { action: 'closePositions', signed }, http);
    results.push({ ...res, intentId: res.intentId ?? intentId });
  }
  return results;
}

/** Cancel an intent that is still queued. */
export async function cancelIntent(session: SessionCredential, intentId: Hex, http?: HttpOptions) {
  const signer = sessionSigner(session);
  const { signed } = await signIntent(signer, 'CancelIntent', {
    user: session.wallet,
    intentId,
    deadline: deadlineIn(INTENT_TTL_SECONDS),
  });
  const { intentId: _omit, ...body } = signed;
  return postIntent(`/intents/${intentId.toLowerCase()}/cancel`, body, http);
}
