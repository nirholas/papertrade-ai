import { z } from 'zod/v4';
import { UserFacingError } from './core/constants.js';

/**
 * Guardrails the wallet owner sets when connecting. They are stored with the encrypted
 * session and enforced server-side on every trade, so a model cannot talk its way past them.
 */
export const PolicySchema = z.object({
  maxMarginPerTradeUsd: z.number().positive().max(10_000_000).describe('Largest margin a single trade may commit, in USD.'),
  maxLeverage: z.number().int().min(1).max(1000).describe('Highest leverage the agent may use.'),
  maxDailyNotionalUsd: z.number().positive().max(1e12).describe('Cap on total notional (margin x leverage) opened in any rolling 24 hours.'),
  maxOpenPositions: z.number().int().min(1).max(500).describe('Most positions that may be open at once.'),
  allowedMarkets: z.array(z.enum(['BTC', 'ETH'])).min(1).describe('Markets the agent may trade.'),
  requireConfirmation: z.boolean().describe('When true every trade needs a preview and an explicit confirmation step.'),
});

export type Policy = z.infer<typeof PolicySchema>;

export const DEFAULT_POLICY: Policy = {
  maxMarginPerTradeUsd: 50,
  maxLeverage: 500,
  maxDailyNotionalUsd: 250_000,
  maxOpenPositions: 5,
  allowedMarkets: ['BTC', 'ETH'],
  requireConfirmation: true,
};

/** Policy for headless local use with a raw private key, read from environment overrides. */
export function policyFromEnv(env: Record<string, string | undefined>): Policy {
  const num = (k: string, d: number) => (env[k] !== undefined && env[k] !== '' ? Number(env[k]) : d);
  return PolicySchema.parse({
    maxMarginPerTradeUsd: num('PAPERTRADE_MAX_MARGIN_USD', DEFAULT_POLICY.maxMarginPerTradeUsd),
    maxLeverage: num('PAPERTRADE_MAX_LEVERAGE', DEFAULT_POLICY.maxLeverage),
    maxDailyNotionalUsd: num('PAPERTRADE_MAX_DAILY_NOTIONAL_USD', DEFAULT_POLICY.maxDailyNotionalUsd),
    maxOpenPositions: num('PAPERTRADE_MAX_OPEN_POSITIONS', DEFAULT_POLICY.maxOpenPositions),
    allowedMarkets: (env.PAPERTRADE_MARKETS || 'BTC,ETH').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    requireConfirmation: (env.PAPERTRADE_REQUIRE_CONFIRMATION ?? 'true') !== 'false',
  });
}

export interface PolicyUsage {
  openPositions: number;
  notionalOpened24hUsd: number;
}

export interface PolicyCheck {
  ok: boolean;
  violations: string[];
}

export function checkTrade(policy: Policy, trade: { market: string; marginUsd: number; leverage: number }, usage: PolicyUsage): PolicyCheck {
  const violations: string[] = [];
  const notional = trade.marginUsd * trade.leverage;
  if (!policy.allowedMarkets.includes(trade.market as Policy['allowedMarkets'][number]))
    violations.push(`${trade.market} is not in your allowed markets (${policy.allowedMarkets.join(', ')}).`);
  if (trade.marginUsd > policy.maxMarginPerTradeUsd) violations.push(`Margin $${trade.marginUsd} is over your per-trade limit of $${policy.maxMarginPerTradeUsd}.`);
  if (trade.leverage > policy.maxLeverage) violations.push(`Leverage ${trade.leverage}x is over your limit of ${policy.maxLeverage}x.`);
  if (usage.openPositions + 1 > policy.maxOpenPositions) violations.push(`You already have ${usage.openPositions} open positions; your limit is ${policy.maxOpenPositions}.`);
  if (usage.notionalOpened24hUsd + notional > policy.maxDailyNotionalUsd)
    violations.push(
      `This trade adds $${notional.toLocaleString('en-US')} notional; $${Math.round(usage.notionalOpened24hUsd).toLocaleString('en-US')} was opened in the last 24h and your daily cap is $${policy.maxDailyNotionalUsd.toLocaleString('en-US')}.`,
    );
  return { ok: violations.length === 0, violations };
}

export function assertTradeAllowed(policy: Policy, trade: { market: string; marginUsd: number; leverage: number }, usage: PolicyUsage) {
  const check = checkTrade(policy, trade, usage);
  if (!check.ok) throw new UserFacingError(`Blocked by your guardrails: ${check.violations.join(' ')} To change limits, the wallet owner reconnects this app with new guardrails.`, 'policy_violation', check);
}
