import { describe, expect, it } from 'vitest';
import { issueQuote, verifyQuote, QUOTE_TTL_SECONDS } from '../src/quote.js';
import { assertTradeAllowed, checkTrade, DEFAULT_POLICY, policyFromEnv, PolicySchema } from '../src/policy.js';

const trade = { wallet: '0x1b2b9754797217913ba76065928914d68b862842', market: 'BTC', side: 'long' as const, marginUsd: 25, leverage: 100 };

describe('quotes', () => {
  it('verifies the exact trade it was issued for', async () => {
    const { quoteId, expiresAt } = await issueQuote('s', trade);
    expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
    await expect(verifyQuote('s', quoteId, trade)).resolves.toBeUndefined();
  });

  it('refuses a different trade, secret, or an expired quote', async () => {
    const now = Date.now();
    const { quoteId } = await issueQuote('s', trade, now);
    await expect(verifyQuote('s', quoteId, { ...trade, leverage: 101 })).rejects.toThrow(/does not match/);
    await expect(verifyQuote('s', quoteId, { ...trade, side: 'short' })).rejects.toThrow(/does not match/);
    await expect(verifyQuote('other', quoteId, trade)).rejects.toThrow(/does not match/);
    await expect(verifyQuote('s', quoteId, trade, now + (QUOTE_TTL_SECONDS + 5) * 1000)).rejects.toThrow(/expired/);
    await expect(verifyQuote('s', 'garbage', trade)).rejects.toThrow(/not valid/);
  });
});

describe('policy', () => {
  it('accepts a trade inside every limit', () => {
    expect(checkTrade(DEFAULT_POLICY, { market: 'BTC', marginUsd: 10, leverage: 100 }, { openPositions: 0, notionalOpened24hUsd: 0 }).ok).toBe(true);
  });

  it('names every violated limit', () => {
    const p = { ...DEFAULT_POLICY, allowedMarkets: ['ETH' as const], maxOpenPositions: 1 };
    const r = checkTrade(p, { market: 'BTC', marginUsd: 1000, leverage: 1000 }, { openPositions: 1, notionalOpened24hUsd: 249_000 });
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(5);
    expect(() => assertTradeAllowed(p, { market: 'BTC', marginUsd: 1000, leverage: 1000 }, { openPositions: 1, notionalOpened24hUsd: 0 })).toThrow(/Blocked by your guardrails/);
  });

  it('reads headless guardrails from the environment', () => {
    const p = policyFromEnv({ PAPERTRADE_MAX_LEVERAGE: '20', PAPERTRADE_MARKETS: 'eth', PAPERTRADE_REQUIRE_CONFIRMATION: 'false' });
    expect(p).toMatchObject({ maxLeverage: 20, allowedMarkets: ['ETH'], requireConfirmation: false });
    expect(() => policyFromEnv({ PAPERTRADE_MAX_LEVERAGE: '5000' })).toThrow();
    expect(PolicySchema.safeParse(DEFAULT_POLICY).success).toBe(true);
  });
});
