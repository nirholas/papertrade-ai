import { UserFacingError } from './core/constants.js';

/**
 * Authenticated encryption for short-lived state the server hands to a browser and gets back
 * (pending connects, account-management challenges). AES-256-GCM under a key derived from the
 * server secret and a purpose label, with an expiry and caller-supplied associated data.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const keys = new Map<string, Promise<CryptoKey>>();
function keyFor(secret: string, purpose: string) {
  const id = `${purpose}\u0000${secret}`;
  let k = keys.get(id);
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('papertrade-ai/seal/v1'), info: enc.encode(purpose) },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    })();
    keys.set(id, k);
  }
  return k;
}

export async function seal(secret: string, purpose: string, value: unknown, ttlSeconds: number, aad = ''): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = enc.encode(JSON.stringify({ v: value, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, await keyFor(secret, purpose), body));
  return `s1.${b64url(iv)}.${b64url(ct)}`;
}

export async function unseal<T>(secret: string, purpose: string, token: unknown, aad = ''): Promise<T> {
  const m = typeof token === 'string' ? /^s1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/.exec(token) : null;
  if (!m) throw new UserFacingError('This request is missing its security token. Reload the page and try again.', 'invalid_request');
  let plain: Uint8Array;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(m[1]), additionalData: enc.encode(aad) }, await keyFor(secret, purpose), fromB64url(m[2])));
  } catch {
    throw new UserFacingError('This request could not be verified. Reload the page and try again.', 'invalid_request');
  }
  const { v, exp } = JSON.parse(dec.decode(plain)) as { v: T; exp: number };
  if (exp < Math.floor(Date.now() / 1000)) throw new UserFacingError('This page expired. Reload it and try again.', 'expired');
  return v;
}
