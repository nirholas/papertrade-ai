import { getJson, type HttpOptions } from './http.js';

/** Typed access to the public Papertrade read API. Every endpoint here is live and unauthenticated. */

export interface ProtocolSummary {
  ok: boolean;
  source: { block: string; at: number; genesis: number };
  balances: { tvl: string; margin: string; lp: string; reserve: string; queue: string };
  activity: { volume: string; open: number };
  fees: { pending: string; lifetime: string };
  paper: { supply: string; staked: string; trackedLp: string; accumulator: string; tailProgress: string; [k: string]: string };
}

export interface ProtocolHistory {
  startMs: number;
  intervalMs: number;
  columns: Record<'tvl' | 'stakingRewards' | 'volume' | 'volumeBtc' | 'volumeEth' | 'traderPnl' | 'users' | 'liquidation' | 'trades' | 'paperSupply' | 'paperStaked' | 'paperRevenue', number[]>;
}

export interface RecentTrade {
  seq: string;
  ts: number;
  wallet: string;
  instrument: string;
  instrumentId: number;
  side: 'long' | 'short';
  leverage: number;
  notionalUsd: number;
  intentId: string | null;
  positionId: string;
  kind: 'open' | 'close' | 'liquidation' | string;
  entry: number | null;
  exit: number | null;
  pnlUsd: number;
}

export interface LiquidationMap {
  ok: boolean;
  instrumentId: number;
  range: string;
  fromRaw: string;
  toRaw: string;
  priceScale: string;
  source: { block: string; at: number; priceAt: number };
  /** [longNotionalRaw, shortNotionalRaw, longCount, shortCount] per price bucket from `fromRaw` to `toRaw`. */
  buckets: [string, string, number, number][];
}

export const LEADERBOARD_WINDOWS = ['24h', '7d', '30d', 'all'] as const;
export type LeaderboardWindow = (typeof LEADERBOARD_WINDOWS)[number];
export const LEADERBOARD_SORT_KEYS = [
  'rank',
  'address',
  'lastActiveTs',
  'totalWindowedPnl',
  'realizedPnl',
  'currentUnrealizedPnl',
  'currentBalance',
  'currentQueued',
  'currentOpenNotional',
  'totalVolume',
  'paperTotal',
  'currentOpenPositionCount',
] as const;
export type LeaderboardSortKey = (typeof LEADERBOARD_SORT_KEYS)[number];

export interface LeaderboardAccount {
  address: string;
  leaderboardName: string | null;
  realizedPnl: string;
  totalWindowedPnl: string;
  totalVolume: string;
  lastActiveTs: number;
  currentBalance: string;
  currentQueued: string;
  currentOpenPositionCount: number;
  currentOpenNotional: string;
  currentUnrealizedPnl: string;
  paperTotal: string;
  _leaderboardRank: number;
}

export interface LeaderboardAccounts {
  ok: boolean;
  count: number;
  summary: { uniqueAccounts: number; trackedBalance: string; trackedQueued: string; trackedOpenNotional: string; trackedPaper: string };
  accounts: LeaderboardAccount[];
}

export interface LeaderboardPosition {
  rank: number;
  address: string;
  instrument: string;
  instrumentId: number;
  instrumentPriceScale: string;
  side: 'long' | 'short';
  leverage: number;
  margin: string;
  entryPrice: string;
  exitPrice: string | null;
  pnl: string;
  openedAt: number;
  closedAt: number | null;
  leaderboardName: string | null;
}

export interface AccountTrade {
  timestampMs: number;
  txHash: string;
  positionId: string;
  instrumentId: number;
  symbol: string;
  priceScaleRaw: string;
  isLong: boolean;
  entryPriceRaw: string;
  marginRaw: string;
  leverage: number;
  kind: 'PositionClosed' | 'Liquidated' | string;
  openedAtMs: number;
  exitPriceRaw: string | null;
  adjustedPnlRaw: string;
  userPaidFeeRaw: string;
  paperMintedRaw: string;
}

export interface PortfolioHistory {
  fromMs: number;
  toMs: number;
  intervalMs: number;
  baseTimeMs: number;
  timeOffsetsMs: number[];
  columns: Record<string, number[]>;
}

export const PORTFOLIO_RANGES = ['1h', '1d', '1w', 'all'] as const;
export type PortfolioRange = (typeof PORTFOLIO_RANGES)[number];

export class PapertradeApi {
  constructor(private readonly opts: HttpOptions = {}) {}

  private get<T>(path: string, params?: Record<string, string | number | undefined>) {
    return getJson<T>(path, params, this.opts);
  }

  ready() {
    return this.get<{ status: string }>('/query/ready');
  }
  protocolSummary() {
    return this.get<ProtocolSummary>('/query/protocol/summary');
  }
  protocolHistory(interval: '1d' = '1d') {
    return this.get<ProtocolHistory>('/query/protocol/history', { interval });
  }
  marketStats() {
    return this.get<{ ok: boolean; markets: Record<string, { volume_24h: string }> }>('/query/protocol/market-stats');
  }
  recentTrades() {
    return this.get<{ ok: boolean; count: number; events: RecentTrade[] }>('/query/protocol/trades/recent');
  }
  queueSummary() {
    return this.get<{ ok: boolean; total: string; count: number; largest: unknown; front: unknown }>('/query/protocol/queue-summary');
  }
  liquidationMap(instrumentId: number, range: '1' = '1') {
    return this.get<LiquidationMap>(`/query/markets/${instrumentId}/liquidation-map`, { range });
  }
  notices() {
    return this.get<{ notices: { id?: string; title?: string; body?: string; level?: string }[] }>('/query/notices');
  }
  leaderboardAccounts(args: { window: LeaderboardWindow; page?: number; sortKey?: LeaderboardSortKey; sortDir?: 'asc' | 'desc'; q?: string }) {
    return this.get<LeaderboardAccounts>('/state/leaderboard/accounts', {
      page: args.page ?? 0,
      pageSize: 25,
      q: args.q,
      sortDir: args.sortDir ?? 'asc',
      sortKey: args.sortKey ?? 'rank',
      window: args.window,
    });
  }
  leaderboardSelf(address: string, window: LeaderboardWindow) {
    return this.get<{ ok: boolean; selfIndex: number | null; selfRow: LeaderboardAccount | null }>(`/state/leaderboard/accounts/${address.toLowerCase()}`, { window });
  }
  leaderboardPositions(window: LeaderboardWindow) {
    return this.get<{ ok: boolean; rows: LeaderboardPosition[] }>('/state/leaderboard/positions', { window });
  }
  accountTrades(address: string, cursor?: string) {
    return this.get<{ items: AccountTrade[]; nextCursor: string | null }>(`/query/accounts/${address.toLowerCase()}/trades`, { cursor });
  }
  portfolioHistory(address: string, range: PortfolioRange) {
    return this.get<PortfolioHistory>(`/query/accounts/${address.toLowerCase()}/portfolio-history`, { range });
  }
  funding(address: string) {
    return this.get<{ items: unknown[]; coreAccount: boolean }>(`/query/accounts/${address.toLowerCase()}/funding`);
  }
  badges(address: string) {
    return this.get<{ ok: boolean; badges: Record<string, { first: number; top3: number; top15: number }>; total: number }>(
      `/query/accounts/${address.toLowerCase()}/leaderboard-badges`,
    );
  }
}
