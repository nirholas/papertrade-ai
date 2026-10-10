/** Browser code for the connect page: wallet discovery (EIP-6963), chain switch, signing, and the begin/finish exchange. */
import { discoverWallets, noWalletMessage, postJson, short, utf8Hex, walletButton, walletError, type Eip1193, type ProviderDetail } from './wallets.js';

interface PageData {
  endpoint: string;
  handle: string;
  allowTrade: boolean;
  defaultPolicy: { maxMarginPerTradeUsd: number; maxLeverage: number; maxDailyNotionalUsd: number; maxOpenPositions: number; allowedMarkets: string[]; requireConfirmation: boolean };
  chain: { chainId: string; chainName: string; nativeCurrency: unknown; rpcUrls: string[]; blockExplorerUrls: string[] };
}

const data = JSON.parse(document.getElementById('page-data')!.textContent!) as PageData;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLParagraphElement>('status');
const approve = $<HTMLButtonElement>('approve');
const walletsEl = $<HTMLDivElement>('wallets');
const guardrails = $<HTMLDivElement>('guardrails');

let provider: Eip1193 | undefined;
let account: string | undefined;
let busy = false;

function setStatus(text: string, tone: '' | 'error' | 'ok' = '') {
  status.textContent = text;
  status.className = `status${tone ? ` ${tone}` : ''}`;
}

function mode(): 'read' | 'trade' {
  return (document.querySelector<HTMLInputElement>('input[name=mode]:checked')?.value as 'read' | 'trade') ?? 'read';
}

function refreshButton() {
  if (busy) return;
  approve.disabled = !account;
  approve.textContent = !account ? 'Connect a wallet' : mode() === 'trade' ? 'Approve trading session' : 'Approve read-only access';
  guardrails.hidden = mode() !== 'trade';
}

// ---- guardrail form ----
const p = data.defaultPolicy;
$<HTMLInputElement>('maxMargin').value = String(p.maxMarginPerTradeUsd);
$<HTMLInputElement>('maxLeverage').value = String(p.maxLeverage);
$<HTMLInputElement>('maxDaily').value = String(p.maxDailyNotionalUsd);
$<HTMLInputElement>('maxOpen').value = String(p.maxOpenPositions);
$<HTMLInputElement>('confirm').checked = p.requireConfirmation;
document.querySelectorAll<HTMLInputElement>('input[name=market]').forEach((c) => (c.checked = p.allowedMarkets.includes(c.value)));
if (!data.allowTrade) document.querySelector<HTMLInputElement>('input[name=mode][value=read]')!.checked = true;
document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', refreshButton));

function readPolicy() {
  const num = (id: string) => Number($<HTMLInputElement>(id).value);
  const policy = {
    maxMarginPerTradeUsd: num('maxMargin'),
    maxLeverage: Math.round(num('maxLeverage')),
    maxDailyNotionalUsd: num('maxDaily'),
    maxOpenPositions: Math.round(num('maxOpen')),
    allowedMarkets: [...document.querySelectorAll<HTMLInputElement>('input[name=market]:checked')].map((c) => c.value),
    requireConfirmation: $<HTMLInputElement>('confirm').checked,
  };
  if (!(policy.maxMarginPerTradeUsd > 0)) throw new Error('Set a max margin per trade.');
  if (!(policy.maxLeverage >= 1 && policy.maxLeverage <= 1000)) throw new Error('Max leverage must be between 1 and 1000.');
  if (!(policy.maxDailyNotionalUsd > 0)) throw new Error('Set a daily position size cap.');
  if (!(policy.maxOpenPositions >= 1)) throw new Error('Allow at least one open position.');
  if (!policy.allowedMarkets.length) throw new Error('Pick at least one market.');
  return policy;
}

// ---- wallet discovery ----
let wallets: ProviderDetail[] = [];
function renderWallets() {
  walletsEl.replaceChildren(
    ...(wallets.length
      ? wallets.map((d) => walletButton(d, account && provider === d.provider ? `${d.info.name}: ${short(account)}` : `Connect ${d.info.name}`, () => connectWallet(d)))
      : [noWalletMessage()]),
  );
}
discoverWallets((list) => {
  wallets = list;
  renderWallets();
});

async function connectWallet(d: ProviderDetail) {
  try {
    setStatus(`Waiting for ${d.info.name}...`);
    const accounts = (await d.provider.request({ method: 'eth_requestAccounts' })) as string[];
    if (!accounts?.length) throw new Error('The wallet returned no accounts.');
    provider = d.provider;
    account = accounts[0].toLowerCase();
    setStatus(`Connected ${short(account)}.`, 'ok');
    renderWallets();
    refreshButton();
  } catch (e) {
    setStatus(walletError(e), 'error');
  }
}

async function ensureChain(pr: Eip1193) {
  const current = String(await pr.request({ method: 'eth_chainId' })).toLowerCase();
  if (current === data.chain.chainId) return;
  try {
    await pr.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: data.chain.chainId }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 4902 && code !== -32603) throw e;
    await pr.request({ method: 'wallet_addEthereumChain', params: [data.chain] });
  }
}

function post(body: Record<string, unknown>) {
  return postJson<{ redirectTo?: string; sign?: any; pending?: string; message?: string }>(data.endpoint, { handle: data.handle, ...body });
}

approve.addEventListener('click', async () => {
  if (!provider || !account || busy) return;
  busy = true;
  approve.disabled = true;
  try {
    const m = mode();
    const policy = m === 'trade' ? readPolicy() : undefined;
    setStatus('Preparing...');
    const begun = await post({ step: 'begin', mode: m, wallet: account });
    let signature: string;
    if (begun.sign.kind === 'typedData') {
      setStatus('Switching your wallet to HyperEVM...');
      await ensureChain(provider);
      setStatus('Sign the session key registration in your wallet.');
      signature = await provider.request({ method: 'eth_signTypedData_v4', params: [account, JSON.stringify(begun.sign.typedData)] });
    } else {
      setStatus('Sign the read-only login message in your wallet.');
      signature = await provider.request({ method: 'personal_sign', params: [utf8Hex(begun.sign.message), account] });
    }
    setStatus(m === 'trade' ? 'Registering your session key with Papertrade. This takes a few seconds...' : 'Verifying...');
    const done = await post({ step: 'finish', pending: begun.pending, signature, policy });
    setStatus(done.message ?? 'Connected. Returning to your app...', 'ok');
    if (done.redirectTo) window.location.assign(done.redirectTo);
  } catch (e) {
    setStatus(walletError(e), 'error');
  } finally {
    busy = false;
    refreshButton();
  }
});

$<HTMLButtonElement>('deny')?.addEventListener('click', async () => {
  try {
    const done = await post({ step: 'deny' });
    if (done.redirectTo) window.location.assign(done.redirectTo);
  } catch (e) {
    setStatus(walletError(e), 'error');
  }
});

refreshButton();
