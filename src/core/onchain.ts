import { createPublicClient, defineChain, fallback, http, type Address } from 'viem';
import { PAPERTRADE } from './constants.js';

/** Public HyperEVM endpoints tried in order when the official RPC rate limits. */
const HYPEREVM_FALLBACK_RPCS = ['https://rpc.hypurrscan.io', 'https://hyperliquid.drpc.org', 'https://rpc.hyperlend.finance'];

export const hyperEvm = defineChain({
  id: PAPERTRADE.chainId,
  name: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: [PAPERTRADE.rpcUrl, ...HYPEREVM_FALLBACK_RPCS] } },
  blockExplorers: { default: { name: 'HyperEVMScan', url: PAPERTRADE.explorerUrl } },
});

let client: ReturnType<typeof createPublicClient> | undefined;
function rpc() {
  client ??= createPublicClient({
    chain: hyperEvm,
    transport: fallback(
      [PAPERTRADE.rpcUrl, ...HYPEREVM_FALLBACK_RPCS].map((url) => http(url, { retryCount: 1, retryDelay: 300, timeout: 8_000 })),
      { rank: false },
    ),
    batch: { multicall: false },
  });
  return client;
}

const factoryAbi = [
  { type: 'function', name: 'computeProxyAddress', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'address' }] },
] as const;

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

/** Each Papertrade account has a dedicated deposit proxy; USDC sent to it on HyperCore is swept into the account. */
export async function depositProxyFor(user: Address): Promise<Address> {
  return rpc().readContract({ address: PAPERTRADE.contracts.depositProxyFactory, abi: factoryAbi, functionName: 'computeProxyAddress', args: [user] });
}

export async function hyperEvmBalances(user: Address): Promise<{ usdc: bigint; hype: bigint }> {
  const [usdc, hype] = await Promise.all([
    rpc().readContract({ address: PAPERTRADE.contracts.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [user] }),
    rpc().getBalance({ address: user }),
  ]);
  return { usdc, hype };
}
