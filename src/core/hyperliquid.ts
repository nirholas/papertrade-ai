import { PAPERTRADE, UserFacingError } from './constants.js';

/**
 * Papertrade prices BTC and ETH off Hyperliquid (mark, oracle and BBO precompiles on HyperEVM),
 * so Hyperliquid's public info API is the right source for quotes and candles.
 */
async function info<T>(body: unknown, f: typeof fetch = fetch): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await f(PAPERTRADE.hyperliquidInfoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return (await res.json()) as T;
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
  }
  throw new UserFacingError(`Hyperliquid market data is unavailable (${(lastErr as Error)?.message ?? 'error'}).`, 'upstream_unreachable');
}

export interface MarketQuote {
  coin: string;
  mark: number;
  oracle: number;
  mid: number;
  bid: number;
  ask: number;
  prevDay: number;
  change24h: number;
  fundingHourly: number;
  openInterestCoins: number;
  dayVolumeUsd: number;
}

interface AssetCtx {
  markPx: string;
  oraclePx: string;
  midPx: string | null;
  prevDayPx: string;
  funding: string;
  openInterest: string;
  dayNtlVlm: string;
}

interface L2Book {
  levels: [{ px: string; sz: string; n: number }[], { px: string; sz: string; n: number }[]];
}

export async function getQuotes(coins: string[], f: typeof fetch = fetch): Promise<Record<string, MarketQuote>> {
  const [meta, ...books] = await Promise.all([
    info<[{ universe: { name: string }[] }, AssetCtx[]]>({ type: 'metaAndAssetCtxs' }, f),
    ...coins.map((coin) => info<L2Book>({ type: 'l2Book', coin }, f)),
  ]);
  const out: Record<string, MarketQuote> = {};
  coins.forEach((coin, i) => {
    const idx = meta[0].universe.findIndex((u) => u.name === coin);
    if (idx < 0) return;
    const ctx = meta[1][idx];
    const book = books[i];
    const bid = Number(book.levels[0][0]?.px ?? ctx.midPx ?? ctx.markPx);
    const ask = Number(book.levels[1][0]?.px ?? ctx.midPx ?? ctx.markPx);
    const mark = Number(ctx.markPx);
    const prevDay = Number(ctx.prevDayPx);
    out[coin] = {
      coin,
      mark,
      oracle: Number(ctx.oraclePx),
      mid: Number(ctx.midPx ?? (bid + ask) / 2),
      bid,
      ask,
      prevDay,
      change24h: prevDay ? (mark - prevDay) / prevDay : 0,
      fundingHourly: Number(ctx.funding),
      openInterestCoins: Number(ctx.openInterest),
      dayVolumeUsd: Number(ctx.dayNtlVlm),
    };
  });
  return out;
}

export const CANDLE_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1d', '3d', '1w', '1M'] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60e3,
  '3m': 180e3,
  '5m': 300e3,
  '15m': 900e3,
  '30m': 1800e3,
  '1h': 3600e3,
  '2h': 7200e3,
  '4h': 14400e3,
  '8h': 28800e3,
  '12h': 43200e3,
  '1d': 86400e3,
  '3d': 259200e3,
  '1w': 604800e3,
  '1M': 2592000e3,
};

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export async function getCandles(coin: string, interval: CandleInterval, count: number, f: typeof fetch = fetch): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - INTERVAL_MS[interval] * count;
  const rows = await info<{ t: number; o: string; h: string; l: string; c: string; v: string }[]>(
    { type: 'candleSnapshot', req: { coin, interval, startTime, endTime } },
    f,
  );
  return rows.slice(-count).map((r) => ({ t: r.t, o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c), v: Number(r.v) }));
}
