import { describe, expect, it } from 'vitest';
import { bustPriceRaw, distanceToBust, estimateSettlement, favourableMove, priceToRaw } from '../src/core/math.js';

const ETH_BUFFER = 481304050180130n;
const BTC_BUFFER = 476041580087574n;

describe('bustPriceRaw', () => {
  it('matches live ETH positions to the tick', () => {
    expect(bustPriceRaw(251275n, 1000, true, ETH_BUFFER)).toBe(251144n);
    expect(bustPriceRaw(251295n, 88, true, ETH_BUFFER)).toBe(248559n);
  });

  it('puts a short bust above entry and a long bust below it', () => {
    const entry = priceToRaw(83000, 10);
    expect(bustPriceRaw(entry, 100, true, BTC_BUFFER)).toBeLessThan(entry);
    expect(bustPriceRaw(entry, 100, false, BTC_BUFFER)).toBeGreaterThan(entry);
  });

  it('moves the bust closer to entry as leverage rises', () => {
    const entry = priceToRaw(2500, 100);
    const at10 = bustPriceRaw(entry, 10, true, ETH_BUFFER);
    const at1000 = bustPriceRaw(entry, 1000, true, ETH_BUFFER);
    expect(at1000).toBeGreaterThan(at10);
    expect(Number(entry - at1000) / Number(entry)).toBeLessThan(0.001);
  });
});

describe('settlement', () => {
  const instrument = { baseRate: 0.0, rateMultiplier: 50, positionMultiplier: 1, referenceNotionalUsd: 0 };

  it('forfeits the full margin when the exit crosses the bust price', () => {
    const r = estimateSettlement({ entry: 100, exit: 89, isLong: true, marginUsd: 10, leverage: 10, bust: 90, instrument });
    expect(r).toMatchObject({ liquidated: true, netPnlUsd: -10 });
  });

  it('pays losses in full and caps them at the margin', () => {
    const r = estimateSettlement({ entry: 100, exit: 95, isLong: true, marginUsd: 10, leverage: 10, bust: 90, instrument });
    expect(r.netPnlUsd).toBeCloseTo(-5, 6);
  });

  it('scales wins down and takes a 2% fee', () => {
    const r = estimateSettlement({ entry: 100, exit: 110, isLong: true, marginUsd: 10, leverage: 10, bust: 90, instrument });
    expect(r.grossPnlUsd).toBeCloseTo(10, 6);
    expect(r.netPnlUsd).toBeGreaterThan(0);
    expect(r.netPnlUsd).toBeLessThan(r.grossPnlUsd);
    expect(r.feeUsd).toBeCloseTo((r.netPnlUsd + r.feeUsd) * 0.02, 9);
  });

  it('returns nothing for a win inside the deadband', () => {
    const r = estimateSettlement({ entry: 50_000, exit: 50_000.5, isLong: true, marginUsd: 10, leverage: 100, bust: 49_600, instrument });
    expect(r.netPnlUsd).toBe(0);
  });

  it('measures moves and bust distance from the trader side', () => {
    expect(favourableMove(100, 90, false)).toBeCloseTo(0.1);
    expect(distanceToBust(100, 90, true)).toBeCloseTo(0.1);
    expect(distanceToBust(100, 110, false)).toBeCloseTo(0.1);
  });
});
