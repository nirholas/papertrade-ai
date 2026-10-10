import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps/app-with-deps';

type Data = Record<string, any>;
type CallResult = { isError?: boolean; structuredContent?: Data; content?: { type: string; text?: string }[] };

declare global {
  interface Window {
    openai?: {
      toolOutput?: Data;
      theme?: 'light' | 'dark';
      callTool?(name: string, args: Record<string, unknown>): Promise<CallResult>;
    };
  }
}

const root = document.getElementById('root')!;
let app: App | undefined;
let current: Data | undefined;
let ticker: ReturnType<typeof setInterval> | undefined;
let countdown: ReturnType<typeof setInterval> | undefined;

// ---------- tiny DOM helpers (textContent only; tool data is never parsed as HTML) ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: { class?: string; text?: string | number; attrs?: Record<string, string> } = {}, ...kids: (Node | null | undefined | false)[]) {
  const n = document.createElement(tag);
  if (props.class) n.className = props.class;
  if (props.text !== undefined) n.textContent = String(props.text);
  for (const [k, v] of Object.entries(props.attrs ?? {})) n.setAttribute(k, v);
  for (const k of kids) if (k) n.append(k);
  return n;
}

const usd = (n: number | null | undefined, signed = false) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const s = Math.abs(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 });
  return signed ? `${n >= 0 ? '+' : '-'}${s}` : n < 0 ? `-${s}` : s;
};
const pct = (n: number | null | undefined, digits = 2) => (n === null || n === undefined || !Number.isFinite(n) ? '-' : `${(n * 100).toFixed(digits)}%`);
const px = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));

function stat(label: string, value: string, tone?: 'up' | 'down' | 'warn') {
  return el('div', { class: 'stat' }, el('div', { class: 'label', text: label }), el('div', { class: `value${tone ? ` ${tone}` : ''}`, text: value }));
}

function sideBadge(side: string, market: string, lev: number) {
  return el('span', { class: `badge ${side === 'long' ? 'up' : 'down'}`, text: `${side.toUpperCase()} ${market} ${lev}x` });
}

function stopTimers() {
  if (ticker) clearInterval(ticker);
  if (countdown) clearInterval(countdown);
  ticker = countdown = undefined;
}

// ---------- live prices (Hyperliquid, the venue Papertrade prices against) ----------

async function liveMids(): Promise<Record<string, number>> {
  const res = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'allMids' }) });
  const j = (await res.json()) as Record<string, string>;
  return { BTC: Number(j.BTC), ETH: Number(j.ETH) };
}

function startTicker(update: (mids: Record<string, number>) => void) {
  const tick = () => liveMids().then(update, () => undefined);
  tick();
  ticker = setInterval(() => {
    if (document.visibilityState === 'visible') tick();
  }, 2500);
}

// ---------- tool calls from the widget ----------

async function call(name: string, args: Record<string, unknown>): Promise<CallResult> {
  if (app) return (await app.callServerTool({ name, arguments: args })) as CallResult;
  if (window.openai?.callTool) return window.openai.callTool(name, args);
  throw new Error('This host does not let the widget call tools. Ask the assistant instead.');
}

function resultText(r: CallResult) {
  return r.content?.find((c) => c.type === 'text')?.text ?? 'The request failed.';
}

async function act(button: HTMLButtonElement, name: string, args: Record<string, unknown>, busyLabel: string) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  button.setAttribute('aria-busy', 'true');
  try {
    const r = await call(name, args);
    if (r.isError || !r.structuredContent) return renderError(resultText(r), current);
    render(r.structuredContent);
  } catch (e) {
    renderError((e as Error).message, current);
  } finally {
    button.disabled = false;
    button.textContent = label;
    button.removeAttribute('aria-busy');
  }
}

// ---------- views ----------

function renderPreview(d: Data) {
  const isLong = d.side === 'long';
  const live = el('span', { class: 'mono', text: px(d.estimatedEntryPrice) });
  const dist = el('div', { class: 'value warn', text: pct(d.liquidationDistance, 3) });
  const bar = el('div', { class: 'meter-fill' });
  const head = el('div', { class: 'head' }, sideBadge(d.side, d.market, d.leverage), el('span', { class: 'muted' }, document.createTextNode('Live '), live));
  const grid = el(
    'div',
    { class: 'grid' },
    stat('Margin (max loss)', usd(d.marginUsd)),
    stat('Position size', usd(d.notionalUsd)),
    stat('Est. entry', px(d.estimatedEntryPrice)),
    stat('Liquidation', px(d.estimatedBustPrice), 'down'),
    el('div', { class: 'stat' }, el('div', { class: 'label', text: 'To liquidation' }), dist),
    stat('Free balance', usd(d.freeBalanceUsd)),
  );
  const meter = el('div', { class: 'meter', attrs: { role: 'img', 'aria-label': 'Distance to liquidation' } }, bar);
  const scen = el(
    'table',
    { class: 'scen' },
    el('thead', {}, el('tr', {}, el('th', { text: 'Move' }), el('th', { text: 'Exit' }), el('th', { text: 'Est. net PnL' }))),
    el(
      'tbody',
      {},
      ...(d.scenarios as Data[]).map((s) =>
        el(
          'tr',
          {},
          el('td', { text: s.priceMove }),
          el('td', { class: 'mono', text: px(s.exitPrice) }),
          el('td', { class: s.liquidated ? 'down' : s.netPnlUsd >= 0 ? 'up' : 'down', text: s.liquidated ? 'Liquidated' : usd(s.netPnlUsd, true) }),
        ),
      ),
    ),
  );
  const footer = el('div', { class: 'actions' });
  if (d.canOpen && d.quoteId) {
    const btn = el('button', { class: `primary ${isLong ? 'up' : 'down'}`, text: `Confirm ${d.side} ${d.market}` }) as HTMLButtonElement;
    const timer = el('span', { class: 'muted small' });
    btn.addEventListener('click', () =>
      act(btn, 'open_position', { market: d.market, side: d.side, marginUsd: d.marginUsd, leverage: d.leverage, quoteId: d.quoteId }, 'Opening...'),
    );
    const expires = Date.parse(d.quoteExpiresAt);
    const tickClock = () => {
      const s = Math.max(0, Math.round((expires - Date.now()) / 1000));
      timer.textContent = s ? `Quote valid ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Quote expired. Ask for a new preview.';
      if (!s) {
        btn.disabled = true;
        if (countdown) clearInterval(countdown);
      }
    };
    tickClock();
    countdown = setInterval(tickClock, 1000);
    footer.append(btn, timer);
  } else {
    footer.append(el('ul', { class: 'blockers' }, ...((d.blockers as string[]) ?? []).map((b) => el('li', { text: b }))));
  }
  const g = d.guardrails;
  const guard =
    g &&
    el(
      'p',
      { class: 'muted small' },
      document.createTextNode(
        `Guardrails: up to ${usd(g.policy.maxMarginPerTradeUsd)} margin and ${g.policy.maxLeverage}x per trade, ${usd(g.notionalOpened24hUsd)} of ${usd(g.policy.maxDailyNotionalUsd)} daily size used, ${g.openPositions}/${g.policy.maxOpenPositions} positions open.`,
      ),
    );
  root.replaceChildren(el('section', { class: 'card' }, head, grid, meter, scen, footer, guard, el('p', { class: 'muted small', text: d.liquidationNote })));

  startTicker((m) => {
    const price = m[d.market];
    if (!price) return;
    live.textContent = px(price);
    const away = isLong ? (price - d.estimatedBustPrice) / price : (d.estimatedBustPrice - price) / price;
    dist.textContent = pct(away, 3);
    bar.style.width = `${Math.max(2, Math.min(100, (away / Math.max(d.liquidationDistance * 2, 1e-6)) * 100))}%`;
  });
}

function renderAccount(d: Data) {
  const positions = d.openPositions as Data[];
  const refresh = el('button', { class: 'ghost', text: 'Refresh' }) as HTMLButtonElement;
  refresh.addEventListener('click', () => act(refresh, 'get_account', { wallet: d.wallet }, 'Loading...'));
  const head = el('div', { class: 'head' }, el('span', { class: 'mono small', text: `${d.wallet.slice(0, 6)}...${d.wallet.slice(-4)}` }), refresh);
  const grid = el(
    'div',
    { class: 'grid' },
    stat('Equity', usd(d.equityUsd)),
    stat('Free', usd(d.availableBalanceUsd)),
    stat('Margin in use', usd(d.lockedMarginUsd)),
    stat('Unrealized', usd(d.unrealizedPnlUsd, true), d.unrealizedPnlUsd >= 0 ? 'up' : 'down'),
  );
  const marks = new Map<string, HTMLElement[]>();
  const list = positions.length
    ? el(
        'div',
        { class: 'positions' },
        ...positions.map((p) => {
          const markCell = el('span', { class: 'mono', text: px(p.markPrice) });
          const distCell = el('span', { class: 'warn', text: pct(p.distanceToBust, 3) });
          (marks.get(p.market) ?? marks.set(p.market, []).get(p.market)!).push(markCell);
          markCell.dataset.bust = String(p.bustPrice);
          markCell.dataset.side = p.side;
          (markCell as any).distCell = distCell;
          const close = el('button', { class: 'ghost small', text: 'Close' }) as HTMLButtonElement;
          close.addEventListener('click', () => act(close, 'close_positions', { positionIds: [p.positionId] }, 'Closing...'));
          return el(
            'div',
            { class: 'pos' },
            el('div', { class: 'pos-top' }, sideBadge(p.side, p.market, p.leverage), el('span', { class: p.estimatedNetPnlUsd >= 0 ? 'up' : 'down', text: usd(p.estimatedNetPnlUsd, true) }), close),
            el(
              'div',
              { class: 'pos-meta muted small' },
              document.createTextNode(`#${p.positionId}  margin ${usd(p.marginUsd)}  entry ${px(p.entryPrice)}  liq ${px(p.bustPrice)}  mark `),
              markCell,
              document.createTextNode('  '),
              distCell,
              document.createTextNode(' away'),
            ),
          );
        }),
      )
    : el('p', { class: 'empty', text: 'No open positions. Ask the assistant to preview a trade, for example "long BTC with $20 at 500x".' });
  const actions = el('div', { class: 'actions' });
  if (positions.length > 1) {
    const all = el('button', { class: 'ghost', text: `Close all ${positions.length}` }) as HTMLButtonElement;
    all.addEventListener('click', () => act(all, 'close_positions', { all: true }, 'Closing...'));
    actions.append(all);
  }
  root.replaceChildren(el('section', { class: 'card' }, head, grid, list, actions, el('p', { class: 'muted small', text: `PnL is estimated at the live bid/ask after the 2% win fee. Updated ${new Date(d.asOf).toLocaleTimeString()}.` })));
  if (positions.length)
    startTicker((m) => {
      for (const [market, cells] of marks)
        for (const c of cells) {
          const price = m[market];
          if (!price) continue;
          c.textContent = px(price);
          const bust = Number(c.dataset.bust);
          const away = c.dataset.side === 'long' ? (price - bust) / price : (bust - price) / price;
          (c as any).distCell.textContent = pct(away, 3);
        }
    });
}

function renderOrder(d: Data) {
  const tone = d.status === 'filled' || d.status === 'closed' ? 'up' : d.status === 'submitted' || d.status === 'noop' ? 'warn' : 'down';
  const title =
    d.action === 'open'
      ? { filled: 'Position opened', submitted: 'Order submitted', failed: 'Order failed', expired: 'Order expired', cancelled: 'Order cancelled' }[d.status as string] ?? `Order ${d.status}`
      : { closed: 'Positions closed', submitted: 'Close submitted', noop: 'Nothing to close' }[d.status as string] ?? `Close ${d.status}`;
  const body: Node[] = [el('div', { class: 'head' }, el('span', { class: `badge ${tone}`, text: title }))];
  if (d.fill)
    body.push(
      el('div', { class: 'grid' }, stat('Entry', px(d.fill.entryPrice)), stat('Liquidation', px(d.fill.bustPrice), 'down'), stat('Margin', usd(d.fill.marginUsd)), stat('Leverage', `${d.fill.leverage}x`), stat('Position', `#${d.fill.positionId}`)),
    );
  if (d.closed?.length)
    body.push(
      el(
        'div',
        { class: 'positions' },
        ...(d.closed as Data[]).map((c) =>
          el('div', { class: 'pos-top' }, sideBadge(c.side, c.market, c.leverage), el('span', { class: c.liquidated ? 'down' : c.netPnlUsd >= 0 ? 'up' : 'down', text: c.liquidated ? 'Liquidated' : usd(c.netPnlUsd, true) })),
        ),
      ),
    );
  if (d.status === 'submitted') body.push(el('p', { class: 'muted small', text: 'The relayer accepted it; settlement on HyperEVM usually takes a few seconds.' }));
  if (d.intentId) body.push(el('p', { class: 'muted small mono', text: `Intent ${d.intentId}` }));
  const view = el('button', { class: 'ghost', text: 'View account' }) as HTMLButtonElement;
  view.addEventListener('click', () => act(view, 'get_account', {}, 'Loading...'));
  body.push(el('div', { class: 'actions' }, view));
  root.replaceChildren(el('section', { class: 'card' }, ...body));
}

function renderError(message: string, previous?: Data) {
  stopTimers();
  const retry = previous && (el('button', { class: 'ghost', text: 'Back' }) as HTMLButtonElement);
  retry?.addEventListener('click', () => render(previous!));
  root.replaceChildren(el('section', { class: 'card error', attrs: { role: 'alert' } }, el('strong', { text: 'Something went wrong' }), el('p', { text: message }), retry ? el('div', { class: 'actions' }, retry) : null));
}

function renderLoading(label: string) {
  stopTimers();
  root.replaceChildren(
    el('section', { class: 'card', attrs: { 'aria-busy': 'true' } }, el('div', { class: 'muted small', text: label }), el('div', { class: 'skeleton wide' }), el('div', { class: 'grid' }, ...Array.from({ length: 4 }, () => el('div', { class: 'skeleton' })))),
  );
}

function render(d: Data) {
  stopTimers();
  current = d;
  if (d.error) return renderError(d.error.message);
  if (d.kind === 'preview') return renderPreview(d);
  if (d.kind === 'order') return renderOrder(d);
  if (d.kind === 'account') return renderAccount(d);
}

// ---------- host wiring ----------

function applyTheme(theme?: string) {
  if (theme === 'light' || theme === 'dark') applyDocumentTheme(theme);
}

async function boot() {
  renderLoading('Waiting for Papertrade...');
  if (window.openai?.toolOutput) {
    applyTheme(window.openai.theme);
    render(window.openai.toolOutput);
  }
  app = new App({ name: 'papertrade-ticket', version: '1.0.0' });
  app.ontoolinput = (p) => {
    const name = app?.getHostContext()?.toolInfo?.tool.name;
    const args = (p.arguments ?? {}) as Data;
    renderLoading(name === 'preview_trade' ? `Pricing ${args.side ?? ''} ${args.market ?? ''} ${args.leverage ? `${args.leverage}x` : ''}...` : name === 'open_position' ? 'Opening position...' : name === 'close_positions' ? 'Closing...' : 'Loading account...');
  };
  app.ontoolresult = (r) => {
    const res = r as CallResult;
    if (res.isError) return renderError(resultText(res));
    if (res.structuredContent) render(res.structuredContent);
  };
  app.onhostcontextchanged = (ctx) => {
    applyTheme(ctx.theme);
    if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  };
  try {
    await app.connect();
    const ctx = app.getHostContext();
    applyTheme(ctx?.theme);
    if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  } catch {
    app = undefined;
  }
}

boot();
