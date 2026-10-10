import { INSTRUMENTS } from './constants.js';
import type { PapertradeApi } from './api.js';
import { getQuotes, type MarketQuote } from './hyperliquid.js';
import { getWalletSnapshot, type WalletSnapshot } from './live.js';
import type { Instrument, TradingState } from './market-state.js';
import { distanceToBust, estimateSettlement } from './math.js';
import { priceFromRaw, round, wadToNumber } from './units.js';

export interface PositionView {
  positionId: string;
  market: string;
  side: 'long' | 'short';
  leverage: number;
  marginUsd: number;
  notionalUsd: number;
  entryPrice: number;
  bustPrice: number;
  markPrice: number;
  /** Fraction of price left before liquidation. */
  distanceToBust: number;
  grossPnlUsd: number;
  estimatedNetPnlUsd: number;
  roe: number;
  openedAt: string;
  intentId: string | null;
}

export interface PendingIntentView {
  intentId: string;
  action: string;
  market: string | null;
  side: 'long' | 'short' | null;
  amountUsd: number | null;
  leverage: number | null;
  acceptedAt: string;
  deadline: string;
  closePositionIds: string[] | null;
}

export interface AccountView {
  wallet: string;
  availableBalanceUsd: number;
  balanceUsd: number;
  lockedMarginUsd: number;
  queuedUsd: number;
  equityUsd: number;
  unrealizedPnlUsd: number;
  openPositions: PositionView[];
  pendingIntents: PendingIntentView[];
  sessionKeys: { address: string; expiresAt: string }[];
  paper: { balance: number; staked: number };
  lifetime: { depositedUsd: number; withdrawnUsd: number; realizedPnlUsd: number; feesPaidUsd: number; tradedNotionalUsd: number; paperRewardsClaimed: number };
  indexedThroughBlock: number;
  asOf: string;
}

export function positionView(
  p: WalletSnapshot['openPositions'][number],
  instruments: Instrument[],
  quotes: Record<string, MarketQuote>,
): PositionView {
  const [positionId, instrumentId, isLong, , entryRaw, marginRaw, leverage, bustRaw, openedAtMs, intentId] = p;
  const inst = instruments.find((i) => i.id === instrumentId);
  const meta = INSTRUMENTS.find((i) => i.id === instrumentId);
  const symbol = inst?.symbol ?? meta?.symbol ?? String(instrumentId);
  const scale = inst?.priceScale ?? meta?.priceScale ?? 1;
  const entry = priceFromRaw(entryRaw, scale);
  const bust = priceFromRaw(bustRaw, scale);
  const q = quotes[symbol];
  const exitPx = q ? (isLong ? q.bid : q.ask) : entry;
  const marginUsd = wadToNumber(marginRaw);
  const est = inst
    ? estimateSettlement({ entry, exit: exitPx, isLong, marginUsd, leverage, bust, instrument: inst })
    : { grossPnlUsd: 0, netPnlUsd: 0, feeUsd: 0, liquidated: false };
  return {
    positionId,
    market: symbol,
    side: isLong ? 'long' : 'short',
    leverage,
    marginUsd: round(marginUsd),
    notionalUsd: round(marginUsd * leverage),
    entryPrice: entry,
    bustPrice: bust,
    markPrice: exitPx,
    distanceToBust: round(distanceToBust(exitPx, bust, isLong), 6),
    grossPnlUsd: round(est.grossPnlUsd),
    estimatedNetPnlUsd: round(est.netPnlUsd),
    roe: marginUsd ? round(est.netPnlUsd / marginUsd, 4) : 0,
    openedAt: new Date(openedAtMs).toISOString(),
    intentId,
  };
}

export function accountView(snapshot: WalletSnapshot, state: TradingState, quotes: Record<string, MarketQuote>): AccountView {
  const positions = snapshot.openPositions.map((p) => positionView(p, state.instruments, quotes));
  const unrealized = positions.reduce((a, p) => a + p.estimatedNetPnlUsd, 0);
  const locked = wadToNumber(snapshot.locked);
  const balance = wadToNumber(snapshot.balance);
  const pending = snapshot.operations.map((o): PendingIntentView => {
    const [intentId, action, instrumentId, isLong, , amount, leverage, acceptedAtMs, deadline, closeIds] = o;
    const sym = instrumentId === null ? null : (INSTRUMENTS.find((i) => i.id === instrumentId)?.symbol ?? String(instrumentId));
    const amountUsd = amount === null ? null : action === 'withdrawToCore' ? Number(amount) / 1e6 : wadToNumber(amount);
    return {
      intentId,
      action,
      market: sym,
      side: isLong === null ? null : isLong ? 'long' : 'short',
      amountUsd,
      leverage,
      acceptedAt: new Date(acceptedAtMs).toISOString(),
      deadline: new Date(deadline * 1000).toISOString(),
      closePositionIds: closeIds,
    };
  });
  return {
    wallet: snapshot.address,
    availableBalanceUsd: round(wadToNumber(snapshot.funds?.availableBalance ?? snapshot.balance)),
    balanceUsd: round(balance),
    lockedMarginUsd: round(locked),
    queuedUsd: round(wadToNumber(snapshot.queued)),
    equityUsd: round(balance + locked + unrealized),
    unrealizedPnlUsd: round(unrealized),
    openPositions: positions,
    pendingIntents: pending,
    sessionKeys: snapshot.sessionKeys.map(([address, exp]) => ({ address, expiresAt: new Date(Number(exp) * 1000).toISOString() })),
    paper: { balance: round(wadToNumber(snapshot.paper?.balance)), staked: round(wadToNumber(snapshot.paper?.staked)) },
    lifetime: {
      depositedUsd: round(wadToNumber(snapshot.lifetime?.depositedRaw)),
      withdrawnUsd: round(wadToNumber(snapshot.lifetime?.withdrawnRaw)),
      realizedPnlUsd: round(wadToNumber(snapshot.lifetime?.realizedPnlRaw)),
      feesPaidUsd: round(wadToNumber(snapshot.lifetime?.feesPaidRaw)),
      tradedNotionalUsd: round(wadToNumber(snapshot.lifetime?.tradedNotionalRaw)),
      paperRewardsClaimed: round(wadToNumber(snapshot.lifetime?.paperRewardsClaimedRaw)),
    },
    indexedThroughBlock: snapshot.indexedThroughBlock,
    asOf: new Date().toISOString(),
  };
}

export async function loadAccount(wallet: string, state: TradingState, f: typeof fetch = fetch) {
  const [snapshot, quotes] = await Promise.all([getWalletSnapshot(wallet, f), getQuotes(['BTC', 'ETH'], f)]);
  return { snapshot, quotes, view: accountView(snapshot, state, quotes) };
}

/**
 * Notional (margin x leverage) the wallet opened in the last 24 hours: open positions opened in the
 * window plus positions opened in the window that already closed, read from the live trade history.
 */
export async function notionalOpenedLast24h(api: PapertradeApi, wallet: string, snapshot: WalletSnapshot, nowMs = Date.now()): Promise<number> {
  const since = nowMs - 24 * 3600 * 1000;
  const seen = new Set<string>();
  let total = 0;
  for (const p of snapshot.openPositions) {
    if (p[8] >= since) {
      seen.add(p[0]);
      total += wadToNumber(p[5]) * p[6];
    }
  }
  for (const o of snapshot.operations) {
    if (o[1] === 'openPosition' && o[5] && o[6]) total += wadToNumber(o[5]) * o[6];
  }
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const { items, nextCursor } = await api.accountTrades(wallet, cursor);
    for (const t of items) {
      if (t.openedAtMs >= since && !seen.has(t.positionId)) {
        seen.add(t.positionId);
        total += wadToNumber(t.marginRaw) * t.leverage;
      }
    }
    const oldest = items[items.length - 1]?.timestampMs ?? 0;
    if (!nextCursor || oldest < since) break;
    cursor = nextCursor;
  }
  return total;
}
