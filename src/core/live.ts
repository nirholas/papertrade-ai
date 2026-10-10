import { createParser } from 'eventsource-parser';
import { PAPERTRADE, UserFacingError } from './constants.js';

/** Open position tuple from the wallet stream. */
export type PositionTuple = [string, number, boolean, boolean, string, string, number, string, number, string | null];
/** Pending operation tuple from the wallet stream. */
export type OperationTuple = [string, string, number | null, boolean | null, boolean | null, string | null, number | null, number, number, string[] | null];

export interface WalletSnapshot {
  address: string;
  indexedThroughBlock: number;
  indexedThroughTimestamp: number;
  sessionKeys: [string, string][];
  walletRevision: number;
  balance: string;
  queued: string;
  locked: string;
  funds: { reservedBalance: string; reservedQueued: string; availableBalance: string; availableQueued: string };
  consumableDebt: string;
  paper: { balance: string; staked: string; pendingBase: string; rewardDebt: string };
  lifetime: {
    depositedRaw: string;
    withdrawnRaw: string;
    realizedPnlRaw: string;
    feesPaidRaw: string;
    tradedNotionalRaw: string;
    paperRewardsClaimedRaw: string;
  };
  openPositions: PositionTuple[];
  operations: OperationTuple[];
  accountRevision: number;
}

export type IntentOutcome = 'succeeded' | 'failed' | 'expired' | 'cancelled' | 'unknown';

interface WalletPatch {
  baseAccountRevision: number;
  accountRevision: number;
  intentOutcomes?: [string, IntentOutcome][];
  addedPositions?: PositionTuple[];
  removedPositionIds?: string[];
  closedPositions?: [string, number, boolean, string, number, boolean, string, string][];
}

interface StreamHandlers {
  onSnapshot?(s: WalletSnapshot): boolean | void;
  onPatch?(p: WalletPatch): boolean | void;
}

/** Connect to the wallet stream, backing off on rate limits and transient upstream errors. */
async function openStream(wallet: string, signal: AbortSignal, f: typeof fetch): Promise<Response & { body: ReadableStream<Uint8Array> }> {
  let last = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await f(`${PAPERTRADE.apiUrl}/state/user/live?wallet=${wallet.toLowerCase()}`, {
      headers: { Accept: 'text/event-stream', 'User-Agent': 'papertrade-ai' },
      signal,
    });
    if (res.ok && res.body) return res as Response & { body: ReadableStream<Uint8Array> };
    last = res.status;
    await res.body?.cancel().catch(() => undefined);
    if (res.status !== 429 && res.status < 500) break;
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5_000) : 400 * 2 ** attempt + Math.random() * 250;
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new UserFacingError(
    last === 429 ? 'Papertrade is rate limiting wallet reads right now. Try again in a few seconds.' : `Papertrade wallet stream failed (${last}).`,
    last === 429 ? 'rate_limited' : 'upstream_error',
  );
}

/**
 * Read the wallet's live stream until a handler returns true or the timeout passes.
 * Resolves true if a handler finished the read, false on timeout.
 */
async function readStream(wallet: string, handlers: StreamHandlers, timeoutMs: number, f: typeof fetch = fetch): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let done = false;
  try {
    const res = await openStream(wallet, controller.signal, f);
    const parser = createParser({
      onEvent(ev) {
        if (done || ev.event !== 'wallet' || !ev.data) return;
        const data = JSON.parse(ev.data) as Record<string, unknown>;
        const finished = 'baseAccountRevision' in data ? handlers.onPatch?.(data as unknown as WalletPatch) : handlers.onSnapshot?.(data as unknown as WalletSnapshot);
        if (finished) {
          done = true;
          controller.abort();
        }
      },
    });
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    while (!done) {
      const { value, done: eof } = await reader.read();
      if (eof) break;
      parser.feed(value);
    }
    return done;
  } catch (err) {
    if (done) return true;
    if ((err as Error).name === 'AbortError') return false;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** The wallet's current state: balance, open positions, pending intents and registered session keys. */
export async function getWalletSnapshot(wallet: string, f: typeof fetch = fetch): Promise<WalletSnapshot> {
  let snapshot: WalletSnapshot | undefined;
  await readStream(
    wallet,
    {
      onSnapshot(s) {
        snapshot = s;
        return true;
      },
    },
    12_000,
    f,
  );
  if (!snapshot) throw new UserFacingError('Papertrade did not return the wallet state in time. Try again.', 'upstream_timeout');
  return snapshot;
}

export interface IntentWatchResult {
  outcome: IntentOutcome | 'pending';
  position?: PositionTuple;
  closed?: WalletPatch['closedPositions'];
}

/**
 * Follow the wallet stream after submitting an intent and report how it resolved: the
 * relayer queues intents and settles them on HyperEVM within a few blocks.
 */
export async function watchIntent(
  wallet: string,
  intentId: string,
  opts: { timeoutMs?: number; settled?: (s: WalletSnapshot) => boolean; fetch?: typeof fetch } = {},
): Promise<IntentWatchResult> {
  const id = intentId.toLowerCase();
  const result: IntentWatchResult = { outcome: 'pending' };
  await readStream(
    wallet,
    {
      onSnapshot(s) {
        const pos = s.openPositions.find((p) => p[9]?.toLowerCase() === id);
        if (pos) {
          result.outcome = 'succeeded';
          result.position = pos;
          return true;
        }
        const pending = s.operations.some((o) => o[0].toLowerCase() === id);
        if (!pending && opts.settled?.(s)) {
          result.outcome = 'succeeded';
          return true;
        }
        return false;
      },
      onPatch(p) {
        const pos = p.addedPositions?.find((x) => x[9]?.toLowerCase() === id);
        if (pos) result.position = pos;
        if (p.closedPositions?.length) result.closed = [...(result.closed ?? []), ...p.closedPositions];
        const outcome = p.intentOutcomes?.find(([iid]) => iid.toLowerCase() === id);
        if (outcome) {
          result.outcome = outcome[1];
          return true;
        }
        return false;
      },
    },
    opts.timeoutMs ?? 15_000,
    opts.fetch,
  );
  return result;
}
