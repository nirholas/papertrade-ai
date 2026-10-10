import { WAD } from './constants.js';

/** Wad (18-decimal) string or bigint to a JS number of dollars. Precise enough for display and estimates. */
export function wadToNumber(raw: string | bigint | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const v = BigInt(raw);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / WAD;
  const frac = abs % WAD;
  const n = Number(whole) + Number(frac) / 1e18;
  return neg ? -n : n;
}

/** Dollars to wad, exact to the cent and beyond: parses the decimal string rather than multiplying a float. */
export function usdToWad(usd: number | string): bigint {
  const s = typeof usd === 'number' ? usd.toFixed(18) : usd.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new RangeError(`"${usd}" is not a dollar amount`);
  const neg = s.startsWith('-');
  const [w, f = ''] = s.replace('-', '').split('.');
  const v = BigInt(w) * WAD + BigInt((f + '0'.repeat(18)).slice(0, 18));
  return neg ? -v : v;
}

export function priceFromRaw(raw: string | number | bigint, priceScale: number): number {
  return Number(raw) / priceScale;
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function fmtUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const dp = abs >= 1000 ? 0 : 2;
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
}

export function fmtPct(n: number, dp = 2): string {
  return `${(n * 100).toFixed(dp)}%`;
}

export function isAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}
