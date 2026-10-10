/** Server-rendered pages (connect, account). Every interpolated value goes through `esc` or `jsonForScript`. */

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** JSON safe to embed in <script type="application/json">. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const CSS = `
:root{--bg:#f7f8fa;--card:#fff;--text:#0d1117;--muted:#5b6472;--border:#e3e6eb;--accent:#0a8f5b;--accent-ink:#fff;--down:#d23b3b;--warn:#b26b00;--focus:#2563eb;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0b0d11;--card:#13161c;--text:#e8eaed;--muted:#9aa3af;--border:#262b35;--accent:#2fd08a;--accent-ink:#04140d;--down:#ff6b6b;--warn:#f0b429;--focus:#7aa2ff}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--text);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;justify-content:center;padding:32px 16px}
main{width:100%;max-width:520px;display:flex;flex-direction:column;gap:16px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.01em}.brand svg{width:28px;height:28px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:14px}
h1{font-size:20px;line-height:1.3;margin:0}h2{font-size:15px;margin:0}p{margin:0}.muted{color:var(--muted)}.small{font-size:13px}.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.modes{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mode{border:1px solid var(--border);border-radius:10px;padding:12px;cursor:pointer;display:flex;flex-direction:column;gap:4px;transition:border-color .15s,background .15s}
.mode:hover{border-color:var(--muted)}.mode:has(input:checked){border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.mode input{position:absolute;opacity:0;pointer-events:none}.mode:has(input:focus-visible){outline:2px solid var(--focus);outline-offset:2px}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fields label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}
.fields .full{grid-column:1/-1}
input[type=number],select{font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:8px 10px;width:100%}
input:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.checks{display:flex;gap:14px;flex-wrap:wrap;font-size:14px}.checks label{display:flex;gap:6px;align-items:center;color:var(--text)}
button,.button{font:600 14px ui-sans-serif,system-ui,sans-serif;border-radius:10px;padding:11px 16px;border:1px solid var(--border);background:var(--card);color:var(--text);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:filter .15s,transform .05s}
button:hover:not(:disabled),.button:hover{filter:brightness(1.06)}button:active:not(:disabled){transform:translateY(1px)}button:disabled{opacity:.55;cursor:not-allowed}
button.primary{background:var(--accent);color:var(--accent-ink);border-color:transparent}button.danger{color:var(--down)}
.row{display:flex;gap:10px;flex-wrap:wrap}.row>*{flex:1}
.wallets{display:flex;flex-direction:column;gap:8px}.wallet{justify-content:flex-start}.wallet img{width:22px;height:22px;border-radius:5px}
.status{min-height:20px;font-size:14px}.status.error{color:var(--down)}.status.ok{color:var(--accent)}
.note{border-left:3px solid var(--warn);padding:8px 12px;background:color-mix(in srgb,var(--warn) 8%,transparent);border-radius:6px;font-size:13px}
.grant{border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;justify-content:space-between;gap:10px;align-items:center}
footer{font-size:12px;color:var(--muted);text-align:center}footer a{color:inherit}
[hidden]{display:none!important}
`;

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" opacity=".08"/><path d="M7 21l6-7 5 4 7-9" fill="none" stroke="#0a8f5b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function layout(opts: { title: string; body: string; data?: unknown; script?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>${esc(opts.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="brand">${LOGO}<span>Papertrade AI</span></div>
${opts.body}
<footer>Open source: <a href="https://github.com/nirholas/papertrade-ai">nirholas/papertrade-ai</a>. Not affiliated with Papertrade. Trading at high leverage can lose your full margin.</footer>
</main>
${opts.data !== undefined ? `<script type="application/json" id="page-data">${jsonForScript(opts.data)}</script>` : ''}
${opts.script ? `<script>${opts.script.replace(/<\/script/gi, '<\\/script')}</script>` : ''}
</body>
</html>`;
}

export interface ConnectPageInput {
  clientName: string;
  redirectHost: string;
  /** Where the browser posts begin/finish/deny. */
  endpoint: string;
  handle: string;
  /** Scopes requested: read-only clients may not offer trading. */
  allowTrade: boolean;
  defaultPolicy: unknown;
  sessionDays: number;
  chain: unknown;
  canDeny: boolean;
  script: string;
}

export function connectPage(i: ConnectPageInput): string {
  const body = `
<section class="card" aria-labelledby="t">
  <h1 id="t"><span class="mono">${esc(i.clientName)}</span> wants to connect to your Papertrade account</h1>
  <p class="muted small">After you approve, you return to <strong>${esc(i.redirectHost)}</strong>.</p>
  <fieldset class="modes" style="border:0;padding:0;margin:0">
    <legend class="small muted" style="margin-bottom:8px">Access</legend>
    <label class="mode"><input type="radio" name="mode" value="read"><strong>Read-only</strong><span class="small muted">Balances, positions and history. Sign one message.</span></label>
    <label class="mode"${i.allowTrade ? '' : ' hidden'}><input type="radio" name="mode" value="trade" ${i.allowTrade ? 'checked' : ''}><strong>Trade with guardrails</strong><span class="small muted">The assistant may open and close positions within your limits.</span></label>
  </fieldset>
  <div id="guardrails" class="fields"${i.allowTrade ? '' : ' hidden'}>
    <label>Max margin per trade (USD)<input type="number" id="maxMargin" min="10" step="1" required></label>
    <label>Max leverage<input type="number" id="maxLeverage" min="1" max="1000" step="1" required></label>
    <label>Daily position size cap (USD)<input type="number" id="maxDaily" min="10000" step="1000" required></label>
    <label>Max open positions<input type="number" id="maxOpen" min="1" max="500" step="1" required></label>
    <div class="full checks" role="group" aria-label="Markets"><span class="small muted">Markets</span><label><input type="checkbox" name="market" value="BTC"> BTC</label><label><input type="checkbox" name="market" value="ETH"> ETH</label></div>
    <label class="full checks"><span><input type="checkbox" id="confirm"> Require my confirmation before every trade (recommended)</span></label>
    <p class="full note">Approving signs a Papertrade session key valid for ${esc(i.sessionDays)} days. It can open, close and cancel positions for your account. It cannot withdraw or transfer funds. Limits are enforced by this server on every trade, and you can revoke access at any time on the account page.</p>
  </div>
  <div class="wallets" id="wallets" aria-label="Wallets"></div>
  <p class="status" id="status" role="status" aria-live="polite"></p>
  <div class="row">
    ${i.canDeny ? '<button type="button" id="deny">Cancel</button>' : ''}
    <button type="button" class="primary" id="approve" disabled>Connect a wallet</button>
  </div>
</section>`;
  return layout({
    title: 'Connect to Papertrade',
    body,
    data: { endpoint: i.endpoint, handle: i.handle, defaultPolicy: i.defaultPolicy, chain: i.chain, allowTrade: i.allowTrade },
    script: i.script,
  });
}

export function messagePage(title: string, message: string, tone: 'ok' | 'error' = 'ok'): string {
  return layout({ title, body: `<section class="card"><h1>${esc(title)}</h1><p class="status ${tone}">${esc(message)}</p></section>` });
}
