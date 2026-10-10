/**
 * Papertrade mainnet deployment. Every address and endpoint here was read from the
 * production exchange frontend and cross-checked against HyperEVM state.
 */
export const PAPERTRADE = {
  chainId: 999,
  apiUrl: 'https://exchange.papertrade.xyz',
  appUrl: 'https://exchange.papertrade.xyz',
  rpcUrl: 'https://rpc.hyperliquid.xyz/evm',
  explorerUrl: 'https://hyperevmscan.io',
  hyperliquidInfoUrl: 'https://api.hyperliquid.xyz/info',
  contracts: {
    exchange: '0x6cd5661646289fb6e65ea5c032310fded797d0a2',
    paper: '0xe40f17915daa230324030003a197cdaef2261c0e',
    paperStaking: '0xaad6c7b0cc3014fc80ffedae0ed7ce5967b0f016',
    depositProxyFactory: '0x1629b7d46bef6e13ff754174fc9f32dea309b38f',
    coreDepositWallet: '0x6b9e773128f453f5c2c60935ee2de2cbc5390a24',
    usdc: '0xb88339cb7199b77e23db6e890353e22632ba630f',
  },
} as const;

export const INSTRUMENTS = [
  { id: 0, symbol: 'BTC', priceScale: 10 },
  { id: 1, symbol: 'ETH', priceScale: 100 },
] as const;

export type InstrumentSymbol = (typeof INSTRUMENTS)[number]['symbol'];

/** Signed intents stay valid for one hour. */
export const INTENT_TTL_SECONDS = 3600;
/** Session keys are registered for 30 days, the same lifetime the official app uses. */
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;
/** A single Close intent carries at most this many position ids. */
export const MAX_CLOSE_BATCH = 12;
/** Wad: every margin, balance and notional amount on Papertrade is an 18-decimal USD value. */
export const WAD = 10n ** 18n;
/** One-time activation fee taken from the first deposit, in USDC (6 decimals). */
export const ACTIVATION_FEE_USDC = 1_000_000n;
/** Smallest deposit the sweeper picks up, in USDC (6 decimals). */
export const MIN_DEPOSIT_USDC = 10_000_000n;

export const SERVER_NAME = 'papertrade-ai';
export const SERVER_VERSION = '0.1.0';

export function instrumentBySymbol(symbol: string) {
  const upper = symbol.trim().toUpperCase();
  const found = INSTRUMENTS.find((i) => i.symbol === upper);
  if (!found) throw new UserFacingError(`Unknown market "${symbol}". Papertrade lists BTC and ETH.`);
  return found;
}

export function instrumentById(id: number) {
  const found = INSTRUMENTS.find((i) => i.id === id);
  if (!found) throw new UserFacingError(`Unknown Papertrade instrument id ${id}.`);
  return found;
}

/** An error whose message is safe and useful to show to the end user or the model. */
export class UserFacingError extends Error {
  constructor(
    message: string,
    readonly code: string = 'invalid_request',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'UserFacingError';
  }
}
