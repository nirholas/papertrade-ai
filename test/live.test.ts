import { describe, expect, it } from 'vitest';
import { runTool } from '../src/tools/registry.js';

// Real reads against exchange.papertrade.xyz and Hyperliquid. Run with `npm run test:live`.
const live = process.env.LIVE === '1' ? describe : describe.skip;
const ctx = { principal: {}, quoteSecret: 's', connectHint: 'connect first' };

live('live market data', () => {
  it('returns BTC and ETH markets with prices', async () => {
    const r = await runTool('get_markets', {}, ctx);
    const markets = (r.data as { markets: { market: string; markPrice: number }[] }).markets;
    expect(markets.map((m) => m.market).sort()).toEqual(['BTC', 'ETH']);
    for (const m of markets) expect(m.markPrice).toBeGreaterThan(0);
  });

  it('returns protocol stats', async () => {
    const r = await runTool('get_protocol_stats', {}, ctx);
    expect((r.data as { tvlUsd: number }).tvlUsd).toBeGreaterThan(0);
  });

  it('reads a leaderboard wallet', async () => {
    const lb = await runTool('get_leaderboard', {}, ctx);
    const wallet = (lb.data as { rows: { address: string }[] }).rows[0].address;
    const acct = await runTool('get_account', { wallet }, ctx);
    expect(acct.summary).toContain(wallet.toLowerCase());
  });

  it('returns candles', async () => {
    const r = await runTool('get_price_chart', { market: 'ETH', interval: '1h', bars: 24 }, ctx);
    expect((r.data as { candles: unknown[] }).candles.length).toBeGreaterThan(10);
  });
});
