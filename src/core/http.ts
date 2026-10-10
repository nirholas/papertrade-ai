import { PAPERTRADE, UserFacingError } from './constants.js';

export type QueryValue = string | number | boolean | undefined | null;

/**
 * The Papertrade read API rejects any query string that is not canonical: each
 * parameter once, sorted by name, URLSearchParams-encoded.
 */
export function canonicalQuery(params: Record<string, QueryValue> = {}): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)] as [string, string])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = new URLSearchParams(entries).toString();
  return qs ? `?${qs}` : '';
}

export interface HttpOptions {
  fetch?: typeof fetch;
  apiUrl?: string;
  timeoutMs?: number;
  retries?: number;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function getJson<T>(path: string, params: Record<string, QueryValue> = {}, opts: HttpOptions = {}): Promise<T> {
  const doFetch = opts.fetch ?? fetch;
  const url = `${opts.apiUrl ?? PAPERTRADE.apiUrl}${path}${canonicalQuery(params)}`;
  const retries = opts.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await doFetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'papertrade-ai' },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
      if (RETRYABLE.has(res.status) && attempt < retries) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      const text = await res.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new UserFacingError(`Papertrade returned a non-JSON response (${res.status}) for ${path}.`, 'upstream_error');
      }
      if (!res.ok) {
        const msg = (body as { error?: string; message?: string })?.message ?? (body as { error?: string })?.error ?? res.statusText;
        throw new UserFacingError(`Papertrade ${path} failed (${res.status}): ${msg}`, 'upstream_error', body);
      }
      return body as T;
    } catch (err) {
      lastError = err;
      if (err instanceof UserFacingError) throw err;
      if (attempt < retries) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
    }
  }
  throw new UserFacingError(`Papertrade is unreachable right now (${(lastError as Error)?.message ?? 'network error'}). Try again shortly.`, 'upstream_unreachable');
}

export interface IntentResponse {
  intentId: string;
  action: string;
  state: string;
  queueRevision?: string;
}

/** POST a signed intent body to the relayer. */
export async function postIntent(path: string, body: unknown, opts: HttpOptions = {}): Promise<IntentResponse> {
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(`${opts.apiUrl ?? PAPERTRADE.apiUrl}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'papertrade-ai' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 35_000),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new UserFacingError(`The Papertrade relayer returned an unreadable response (${res.status}).`, 'relayer_error');
  }
  if (!res.ok || parsed.error || parsed.ok === false) {
    const code = String(parsed.code ?? parsed.error ?? `http_${res.status}`);
    const message = String(parsed.message ?? parsed.error ?? res.statusText ?? 'rejected');
    throw new UserFacingError(`Papertrade rejected the intent: ${describeRelayerError(code, message)}`, code, parsed);
  }
  return parsed as unknown as IntentResponse;
}

const RELAYER_ERRORS: Record<string, string> = {
  invalid_intent: 'the signed intent was malformed or failed validation',
  deadline_expired: 'the intent deadline passed before it reached the relayer',
  unauthorized_intent: 'the signer is not authorized for this wallet (the session key may have expired or been revoked)',
  intent_conflict: 'an intent with this nonce already exists; retry',
  admission_rejected: 'the exchange did not admit the order (balance, size or open-interest limits)',
  below_minimum_paper_stake: 'the wallet does not meet the minimum PAPER stake for this action',
  below_minimum_withdrawal: 'the amount is under the minimum withdrawal',
  intake_action_paused: 'this action is currently paused by the exchange',
  rate_limited: 'too many requests; wait a moment and retry',
};

function describeRelayerError(code: string, message: string) {
  const known = RELAYER_ERRORS[code];
  if (known && message && message !== code) return `${known} (${message})`;
  return known ?? message;
}
