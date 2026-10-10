import type { Instrument } from './market-state.js';

/**
 * Bust (liquidation) price in raw price units, matching the exchange to the tick. The protocol
 * rounds twice, with a per-instrument buffer (field 16 of the instrument tuple):
 *   long:  p0 = ceil(entry * (L - 1) / L),  bust = floor(p0 * (1e18 + buffer) / 1e18)
 *   short: p0 = floor(entry * (L + 1) / L), bust = ceil(p0 * (1e18 - buffer) / 1e18)
 * Reproduces 205 of 205 recorded live positions.
 */
export function bustPriceRaw(entryRaw: bigint, leverage: number, isLong: boolean, bustBufferRaw: bigint): bigint {
  const ONE = 10n ** 18n;
  const L = BigInt(leverage);
  if (isLong) {
    const p0 = (entryRaw * (L - 1n) + L - 1n) / L;
    return (p0 * (ONE + bustBufferRaw)) / ONE;
  }
  const p0 = (entryRaw * (L + 1n)) / L;
  return (p0 * (ONE - bustBufferRaw) + ONE - 1n) / ONE;
}

/** Signed fractional move in the trader's favour. */
export function favourableMove(entry: number, exit: number, isLong: boolean): number {
  return isLong ? (exit - entry) / entry : (entry - exit) / entry;
}

export interface SettlementEstimate {
  /** Gross price PnL before the win curve, deadband or fees. */
  grossPnlUsd: number;
  /** What the exchange would credit on close at `exit`, after the win curve and the 2% win fee. Losses pay in full. */
  netPnlUsd: number;
  feeUsd: number;
  liquidated: boolean;
}

/**
 * Settlement at a hypothetical exit price, reproducing the exchange's win curve:
 * the exit is treated as worse by entry/50000, the win is scaled by
 * (1 - baseRate) / (1 + 1/(move*rateMultiplier) + referenceNotional/(1e6*move*positionMultiplier)),
 * and a 2% fee is taken from wins. Verified against closed mainnet trades.
 */
export function estimateSettlement(args: {
  entry: number;
  exit: number;
  isLong: boolean;
  marginUsd: number;
  leverage: number;
  bust: number;
  instrument: Pick<Instrument, 'baseRate' | 'rateMultiplier' | 'positionMultiplier' | 'referenceNotionalUsd'>;
}): SettlementEstimate {
  const { entry, exit, isLong, marginUsd, leverage, bust, instrument } = args;
  const notional = marginUsd * leverage;
  const crossed = isLong ? exit <= bust : exit >= bust;
  if (crossed) return { grossPnlUsd: -marginUsd, netPnlUsd: -marginUsd, feeUsd: 0, liquidated: true };
  const rawMove = favourableMove(entry, exit, isLong);
  const grossPnlUsd = notional * rawMove;
  if (rawMove <= 0) {
    const loss = Math.max(grossPnlUsd, -marginUsd);
    return { grossPnlUsd, netPnlUsd: loss, feeUsd: 0, liquidated: false };
  }
  const deadband = entry / 50_000;
  const effExit = isLong ? exit - deadband : exit + deadband;
  const move = favourableMove(entry, effExit, isLong);
  if (move <= 0) return { grossPnlUsd, netPnlUsd: 0, feeUsd: 0, liquidated: false };
  const scale =
    (1 - instrument.baseRate) /
    (1 + 1 / (move * instrument.rateMultiplier) + instrument.referenceNotionalUsd / (1e6 * move * instrument.positionMultiplier));
  const adjusted = notional * move * scale;
  const feeUsd = adjusted * 0.02;
  return { grossPnlUsd, netPnlUsd: adjusted - feeUsd, feeUsd, liquidated: false };
}

/** Fractional distance from the current price to bust, positive while the position is alive. */
export function distanceToBust(mark: number, bust: number, isLong: boolean): number {
  return isLong ? (mark - bust) / mark : (bust - mark) / mark;
}

/** Price to raw integer units at the instrument's tick (BTC 0.1, ETH 0.01). */
export function priceToRaw(price: number, priceScale: number): bigint {
  return BigInt(Math.round(price * priceScale));
}
