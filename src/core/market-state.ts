import { getJson, type HttpOptions } from './http.js';
import { wadToNumber } from './units.js';

/** Raw `/state/trading` payload. Instruments are 23-field positional tuples. */
export interface TradingStateRaw {
  schemaVersion: number;
  indexedThroughBlock: number;
  tradingPaused: boolean;
  minimumTradeSizeRaw: string;
  minimumOpenNotionalRaw: string;
  accRewardPerShareRaw: string;
  instruments: unknown[][];
  intake: [number, string, string, string[]];
}

export interface Instrument {
  id: number;
  symbol: string;
  assetIndex: number;
  priceScale: number;
  active: boolean;
  paused: boolean;
  terminal: boolean;
  retired: boolean;
  closeOnly: boolean;
  openable: boolean;
  maxLeverage: number;
  maxPositionNotionalUsd: number;
  /** Fraction, e.g. 0.000476 for 4.76 bps. */
  bustBuffer: number;
  baseRate: number;
  rateMultiplier: number;
  positionMultiplier: number;
  referenceNotionalUsd: number;
  longOpenInterestUsd: number;
  shortOpenInterestUsd: number;
  longCapUsd: number;
  shortCapUsd: number;
  raw: { bustBufferRaw: string; maxPositionNotionalRaw: string };
}

export interface TradingState {
  indexedThroughBlock: number;
  tradingPaused: boolean;
  minimumMarginUsd: number;
  minimumNotionalUsd: number;
  minimumTradeSizeRaw: bigint;
  minimumOpenNotionalRaw: bigint;
  minimumPaperStakeUsd: number;
  pausedActions: string[];
  instruments: Instrument[];
}

export function decodeInstrument(t: unknown[]): Instrument {
  const s = (i: number) => String(t[i] ?? '0');
  const active = Boolean(t[4]);
  const paused = Boolean(t[5]);
  return {
    id: Number(t[0]),
    symbol: String(t[1]),
    assetIndex: Number(t[2]),
    priceScale: Number(t[3]),
    active,
    paused,
    terminal: Boolean(t[6]),
    retired: Boolean(t[7]),
    closeOnly: Boolean(t[8]),
    openable: active && !paused && !t[6] && !t[7] && !t[8],
    maxLeverage: Number(t[14]),
    maxPositionNotionalUsd: wadToNumber(s(15)),
    bustBuffer: wadToNumber(s(16)),
    baseRate: wadToNumber(s(17)),
    rateMultiplier: wadToNumber(s(12)),
    positionMultiplier: wadToNumber(s(13)),
    referenceNotionalUsd: wadToNumber(s(18)),
    longOpenInterestUsd: wadToNumber(s(19)),
    shortOpenInterestUsd: wadToNumber(s(20)),
    longCapUsd: wadToNumber(s(21)),
    shortCapUsd: wadToNumber(s(22)),
    raw: { bustBufferRaw: s(16), maxPositionNotionalRaw: s(15) },
  };
}

export function decodeTradingState(raw: TradingStateRaw): TradingState {
  const intake = raw.intake ?? [0, '0', '0', []];
  return {
    indexedThroughBlock: raw.indexedThroughBlock,
    tradingPaused: raw.tradingPaused,
    minimumMarginUsd: wadToNumber(raw.minimumTradeSizeRaw),
    minimumNotionalUsd: wadToNumber(raw.minimumOpenNotionalRaw),
    minimumTradeSizeRaw: BigInt(raw.minimumTradeSizeRaw),
    minimumOpenNotionalRaw: BigInt(raw.minimumOpenNotionalRaw),
    minimumPaperStakeUsd: wadToNumber(intake[1]),
    pausedActions: Array.isArray(intake[3]) ? intake[3].map(String) : [],
    instruments: raw.instruments.map(decodeInstrument),
  };
}

export async function fetchTradingState(opts: HttpOptions = {}): Promise<TradingState> {
  return decodeTradingState(await getJson<TradingStateRaw>('/state/trading', {}, opts));
}
