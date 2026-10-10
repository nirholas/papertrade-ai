/** EIP-6963 wallet discovery and small EIP-1193 helpers shared by the connect and account pages. */

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<any>;
}
export interface ProviderDetail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
}

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

/** Collects announced wallets (plus a legacy injected provider) and reports the list on every change. */
export function discoverWallets(onChange: (wallets: ProviderDetail[]) => void) {
  const found = new Map<string, ProviderDetail>();
  const emit = () => {
    const list = [...found.values()];
    if (!list.length && window.ethereum) list.push({ info: { uuid: 'injected', name: 'Browser wallet', icon: '', rdns: 'injected' }, provider: window.ethereum });
    onChange(list);
  };
  window.addEventListener('eip6963:announceProvider', (e) => {
    const d = (e as CustomEvent<ProviderDetail>).detail;
    if (d?.info?.uuid && d.provider) {
      found.set(d.info.uuid, d);
      emit();
    }
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  emit();
  setTimeout(emit, 400);
}

export function walletButton(d: ProviderDetail, label: string, onClick: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'wallet';
  if (d.info.icon && /^data:image\/(png|svg\+xml|webp|jpeg);/.test(d.info.icon)) {
    const img = document.createElement('img');
    img.src = d.info.icon;
    img.alt = '';
    b.append(img);
  }
  b.append(document.createTextNode(label));
  b.addEventListener('click', onClick);
  return b;
}

export function noWalletMessage() {
  const msg = document.createElement('p');
  msg.className = 'small muted';
  msg.textContent = 'No browser wallet found. Install MetaMask, Rabby, Coinbase Wallet or another EVM wallet, then reload this page.';
  return msg;
}

export function walletError(e: unknown): string {
  const err = e as { code?: number; message?: string };
  if (err?.code === 4001) return 'You rejected the request in your wallet.';
  if (err?.code === -32002) return 'Your wallet already has a pending request. Open it to continue.';
  return err?.message ?? String(e);
}

export function utf8Hex(s: string) {
  return `0x${Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function postJson<T = Record<string, any>>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Request failed (${res.status}).`);
  return json as T;
}
