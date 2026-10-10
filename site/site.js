// Papertrade AI site: copy buttons, install tabs, prompt copying and the live market card.
// Every number on the page comes from this server's public REST API, which reads Papertrade and Hyperliquid live.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (!btn) return;
  const label = btn.dataset.label || btn.textContent;
  btn.dataset.label = label;
  btn.textContent = 'Copied';
  btn.classList.add('done');
  clearTimeout(btn._t);
  btn._t = setTimeout(() => {
    btn.textContent = label;
    btn.classList.remove('done');
  }, 1600);
}

// ---- copy buttons on every code block and [data-copy] ----
for (const pre of $$('pre')) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy';
  btn.textContent = 'Copy';
  btn.setAttribute('aria-label', 'Copy code');
  btn.addEventListener('click', () => copyText(pre.querySelector('code')?.innerText ?? pre.innerText, btn));
  pre.append(btn);
}
for (const btn of $$('[data-copy]:not(.prompt)')) btn.addEventListener('click', () => copyText(btn.dataset.copy, btn));
for (const btn of $$('.prompt')) {
  btn.addEventListener('click', () => {
    copyText(btn.dataset.copy);
    const small = btn.querySelector('small');
    if (!small) return;
    small.textContent = 'Copied. Paste it into your assistant.';
    clearTimeout(btn._t);
    btn._t = setTimeout(() => (small.textContent = small.dataset.hint), 1800);
  });
}

// ---- accessible tabs ----
for (const list of $$('[role=tablist]')) {
  const tabs = $$('[role=tab]', list);
  const select = (tab, focus) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    history.replaceState(null, '', `#${tab.id}`);
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return;
      e.preventDefault();
      const next = k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      select(tabs[next], true);
    });
  });
  const fromHash = tabs.find((t) => `#${t.id}` === location.hash);
  if (fromHash) select(fromHash);
}

// ---- live data ----
const live = $('#live');
if (live) {
  const fmtUsd = (n, d = 0) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: d, minimumFractionDigits: d });
  const fmtCompact = (n) => '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const fmtPct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`;
  const fmtPrice = (n) => n.toLocaleString('en-US', { maximumFractionDigits: n < 1000 ? 2 : 1 });

  let market = 'BTC';
  let markets;
  const charts = new Map();

  async function api(name, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/v1/tools/${name}${qs ? `?${qs}` : ''}`, { headers: { accept: 'application/json' } });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`);
    return body.data;
  }

  function sparkline(candles, up) {
    const W = 600;
    const H = 170;
    const pad = 8;
    const closes = candles.map((c) => c.c);
    const lo = Math.min(...candles.map((c) => c.l));
    const hi = Math.max(...candles.map((c) => c.h));
    const span = hi - lo || 1;
    const x = (i) => (i / (closes.length - 1)) * W;
    const y = (v) => pad + (1 - (v - lo) / span) * (H - pad * 2);
    const line = closes.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const color = up ? 'var(--up)' : 'var(--down)';
    const id = `g${Math.random().toString(36).slice(2)}`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${market} price, last ${candles.length} 15-minute candles">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
<path d="${line}L${W},${H}L0,${H}Z" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
  }

  function render() {
    const m = markets?.markets.find((x) => x.market === market);
    const chart = charts.get(market);
    if (!m) return;
    $('#lv-px').textContent = fmtPrice(m.markPrice);
    $('#lv-px').classList.remove('sk');
    const chg = $('#lv-chg');
    chg.textContent = `${fmtPct(m.change24h)} 24h`;
    chg.className = `chg num ${m.change24h >= 0 ? 'up' : 'down'}`;
    $('#lv-lev').textContent = `${m.maxLeverage}x`;
    $('#lv-vol').textContent = fmtCompact(m.papertradeVolume24hUsd);
    $('#lv-min').textContent = `${fmtUsd(markets.minimumMarginUsd)} / ${fmtCompact(markets.minimumNotionalUsd)}`;
    $('#lv-status').textContent = markets.tradingPaused ? 'Paused' : m.open ? 'Open' : 'Closed';
    for (const el of $$('#live .kv dd')) el.classList.remove('sk');
    const total = m.longOpenInterestUsd + m.shortOpenInterestUsd || 1;
    $('#lv-oi-l').style.width = `${(m.longOpenInterestUsd / total) * 100}%`;
    $('#lv-oi-s').style.width = `${(m.shortOpenInterestUsd / total) * 100}%`;
    $('#lv-oi-lt').textContent = `Longs ${fmtCompact(m.longOpenInterestUsd)}`;
    $('#lv-oi-st').textContent = `Shorts ${fmtCompact(m.shortOpenInterestUsd)}`;
    if (chart) $('#lv-chart').innerHTML = sparkline(chart.candles, chart.stats.change >= 0);
    $('#lv-tv').href = chart?.tradingView ?? 'https://www.tradingview.com/';
    $('#lv-err').hidden = true;
  }

  async function loadChart(sym) {
    charts.set(sym, await api('get_price_chart', { market: sym, interval: '15m', count: 96 }));
  }

  async function refresh() {
    try {
      const [mk] = await Promise.all([api('get_markets'), charts.has(market) ? null : loadChart(market)]);
      markets = mk;
      $('#lv-time').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      render();
    } catch (e) {
      const err = $('#lv-err');
      err.hidden = false;
      $('#lv-err-msg').textContent = `Live data is unavailable right now: ${e.message}`;
    }
  }

  for (const b of $$('#live .seg button')) {
    b.addEventListener('click', async () => {
      market = b.dataset.market;
      for (const o of $$('#live .seg button')) o.setAttribute('aria-pressed', String(o === b));
      render();
      if (!charts.has(market)) {
        try {
          await loadChart(market);
          render();
        } catch (e) {
          $('#lv-err').hidden = false;
          $('#lv-err-msg').textContent = `Chart unavailable: ${e.message}`;
        }
      }
    });
  }
  $('#lv-retry')?.addEventListener('click', refresh);

  refresh();
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    refresh();
  }, 15_000);
  // Candles refresh every 5 minutes so the line keeps moving without hammering the API.
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    charts.clear();
    refresh();
  }, 300_000);

  // ---- protocol stats strip ----
  const stats = $('#stats');
  if (stats) {
    api('get_protocol_stats')
      .then((s) => {
        const set = (id, v) => {
          const el = $(id);
          el.textContent = v;
          el.classList.remove('sk');
        };
        set('#st-tvl', fmtCompact(s.tvlUsd));
        set('#st-vol', fmtCompact(s.lifetimeVolumeUsd));
        set('#st-pos', s.openPositions.toLocaleString('en-US'));
        set('#st-fees', fmtCompact(s.lifetimeFeesUsd));
      })
      .catch(() => {
        stats.hidden = true;
      });
  }
}
