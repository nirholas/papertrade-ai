/** Account page: prove wallet ownership with a signed message, list the AI apps connected to it, revoke any of them. */
import { discoverWallets, noWalletMessage, postJson, short, utf8Hex, walletButton, walletError, type Eip1193, type ProviderDetail } from './wallets.js';

interface Grant {
  id: string;
  clientName: string;
  mode: 'read' | 'trade';
  scope: string[];
  createdAt: number;
  sessionAddress?: string;
  sessionExpiresAt?: number;
  policy?: { maxMarginPerTradeUsd: number; maxLeverage: number; maxDailyNotionalUsd: number; maxOpenPositions: number; allowedMarkets: string[]; requireConfirmation: boolean };
}

const endpoint = '/account/api';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $<HTMLParagraphElement>('status');
const walletsEl = $<HTMLDivElement>('wallets');
const grantsEl = $<HTMLDivElement>('grants');
let token: string | undefined;

function setStatus(text: string, tone: '' | 'error' | 'ok' = '') {
  status.textContent = text;
  status.className = `status${tone ? ` ${tone}` : ''}`;
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function renderGrants(grants: Grant[]) {
  if (!grants.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No AI apps are connected to this wallet. Connect one from Claude, ChatGPT, Cursor or any MCP client using the server URL on the home page. An app you connected in the last minute can take up to a minute to appear here.';
    grantsEl.replaceChildren(p);
    return;
  }
  grantsEl.replaceChildren(
    ...grants.map((g) => {
      const row = document.createElement('div');
      row.className = 'grant';
      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = g.clientName;
      const meta = document.createElement('p');
      meta.className = 'small muted';
      const lines = [`${g.mode === 'trade' ? 'Trading' : 'Read-only'} since ${new Date(g.createdAt).toLocaleString()}`];
      if (g.policy)
        lines.push(
          `Limits: ${usd(g.policy.maxMarginPerTradeUsd)} margin and ${g.policy.maxLeverage}x per trade, ${usd(g.policy.maxDailyNotionalUsd)} size per 24h, ${g.policy.maxOpenPositions} open, ${g.policy.allowedMarkets.join('/')}${g.policy.requireConfirmation ? ', confirmation required' : ''}.`,
        );
      if (g.sessionAddress) lines.push(`Session key ${short(g.sessionAddress)}${g.sessionExpiresAt ? ` until ${new Date(g.sessionExpiresAt * 1000).toLocaleDateString()}` : ''}.`);
      meta.textContent = lines.join(' ');
      info.append(name, meta);
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'danger';
      revoke.textContent = 'Revoke';
      revoke.addEventListener('click', async () => {
        revoke.disabled = true;
        revoke.textContent = 'Revoking...';
        try {
          await postJson(endpoint, { step: 'revoke', token, grantId: g.id });
          row.remove();
          setStatus(`Revoked ${g.clientName}. Its tokens and session key are deleted.`, 'ok');
          if (!grantsEl.children.length) renderGrants([]);
        } catch (e) {
          revoke.disabled = false;
          revoke.textContent = 'Revoke';
          setStatus(walletError(e), 'error');
        }
      });
      row.append(info, revoke);
      return row;
    }),
  );
}

async function signIn(d: ProviderDetail) {
  try {
    setStatus(`Waiting for ${d.info.name}...`);
    const provider: Eip1193 = d.provider;
    const [account] = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
    if (!account) throw new Error('The wallet returned no accounts.');
    const wallet = account.toLowerCase();
    const challenge = await postJson<{ message: string; challenge: string }>(endpoint, { step: 'challenge', wallet });
    setStatus('Sign the message in your wallet to prove you own it. It costs nothing and moves no funds.');
    const signature = await provider.request({ method: 'personal_sign', params: [utf8Hex(challenge.message), account] });
    const res = await postJson<{ token: string; grants: Grant[] }>(endpoint, { step: 'list', challenge: challenge.challenge, signature });
    token = res.token;
    $<HTMLElement>('who').textContent = `Signed in as ${short(wallet)}`;
    $<HTMLElement>('signed-in').hidden = false;
    walletsEl.hidden = true;
    setStatus('');
    renderGrants(res.grants);
  } catch (e) {
    setStatus(walletError(e), 'error');
  }
}

discoverWallets((list) => {
  if (token) return;
  walletsEl.replaceChildren(...(list.length ? list.map((d) => walletButton(d, `Sign in with ${d.info.name}`, () => signIn(d))) : [noWalletMessage()]));
});
