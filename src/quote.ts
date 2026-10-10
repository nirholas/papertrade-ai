import { UserFacingError } from './core/constants.js';

/**
 * Quote tokens bind a confirmation to the exact trade that was previewed. `preview_trade`
 * returns one; `open_position` refuses to sign unless it gets a valid, unexpired token for
 * the same wallet, market, side, margin and leverage. Stateless: an HMAC under a server secret.
 */
export interface QuotedTrade {
  wallet: string;
  market: string;
  side: 'long' | 'short';
  marginUsd: number;
  leverage: number;
}

export const QUOTE_TTL_SECONDS = 180;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function canonical(t: QuotedTrade, exp: number) {
  return [t.wallet.toLowerCase(), t.market.toUpperCase(), t.side, t.marginUsd.toFixed(6), String(t.leverage), String(exp)].join('|');
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function issueQuote(secret: string, trade: QuotedTrade, nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + QUOTE_TTL_SECONDS;
  return { quoteId: `q1.${exp}.${await hmac(secret, canonical(trade, exp))}`, expiresAt: exp };
}

export async function verifyQuote(secret: string, quoteId: string, trade: QuotedTrade, nowMs = Date.now()) {
  const m = /^q1\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(quoteId ?? '');
  if (!m) throw new UserFacingError('That quoteId is not valid. Call preview_trade first and pass the quoteId it returns.', 'quote_invalid');
  const exp = Number(m[1]);
  if (exp < Math.floor(nowMs / 1000)) throw new UserFacingError('That quote expired (quotes last 3 minutes). Call preview_trade again.', 'quote_expired');
  const expected = await hmac(secret, canonical(trade, exp));
  if (!timingSafeEqual(expected, m[2]))
    throw new UserFacingError('The trade does not match its quote. Preview the exact market, side, margin and leverage you want, then confirm.', 'quote_mismatch');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
