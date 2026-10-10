#!/usr/bin/env node
/**
 * Builds everything people and agents discover Papertrade AI through, from one source of truth:
 *
 *   public/            the static site served by the Worker: landing page, docs (HTML and raw
 *                      markdown), llms.txt, sitemap, robots, .well-known discovery files, images
 *   docs/tools.md      the tool reference, generated from the live tool registry
 *   server.json        MCP registry entry
 *   gemini-extension.json, .claude-plugin/*, .mcp.json, glama.json
 *
 * Versions, URLs and the tool list come from package.json, wrangler.jsonc and the registry, so
 * no listing can drift from the code. Run after `npm run build` (it imports dist/index.js).
 */
import { mkdir, readFile, readdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { Resvg } from '@resvg/resvg-js';
import { z } from 'zod/v4';
import { INDEXNOW_KEY } from './indexnow-key.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const wrangler = JSON.parse((await readFile(join(root, 'wrangler.jsonc'), 'utf8')).replace(/^\s*\/\/.*$/gm, ''));
const { TOOLS, SERVER_VERSION } = await import(join(root, 'dist/index.js'));

if (SERVER_VERSION !== pkg.version) throw new Error(`SERVER_VERSION ${SERVER_VERSION} does not match package.json ${pkg.version}`);

const SITE = wrangler.vars.PUBLIC_URL.replace(/\/+$/, '');
const HOST = new URL(SITE).host;
const MCP_URL = `${SITE}/mcp`;
const PUBLIC_MCP_URL = `${SITE}/public/mcp`;
const REPO = 'https://github.com/nirholas/papertrade-ai';
const NPM = 'https://www.npmjs.com/package/papertrade-ai';
const REGISTRY_NAME = pkg.mcpName;
const VERSION = pkg.version;
const TODAY = new Date().toISOString().slice(0, 10);
const NAME = 'Papertrade AI';
const TAGLINE = 'Trade perps from any AI';
const DESCRIPTION =
  'Open-source MCP server that lets Claude, ChatGPT, Codex, Cursor, Gemini and VS Code read live Papertrade markets and trade BTC and ETH perps up to 1000x, with non-custodial session keys and guardrails you set.';
const SHORT = 'Trade Papertrade BTC and ETH perps from Claude, ChatGPT, Codex, Cursor and any MCP client.';

const CURSOR_CONFIG = Buffer.from(JSON.stringify({ url: MCP_URL })).toString('base64');
const LINKS = {
  cursor: `https://cursor.com/install-mcp?name=papertrade&config=${encodeURIComponent(CURSOR_CONFIG)}`,
  vscode: `https://insiders.vscode.dev/redirect/mcp/install?name=papertrade&config=${encodeURIComponent(JSON.stringify({ type: 'http', url: MCP_URL }))}`,
  vscodeInsiders: `https://insiders.vscode.dev/redirect/mcp/install?name=papertrade&config=${encodeURIComponent(JSON.stringify({ type: 'http', url: MCP_URL }))}&quality=insiders`,
  claudeConnectors: 'https://claude.ai/settings/connectors',
  chatgpt: 'https://chatgpt.com',
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ldJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// Fail the build on the two characters the house style bans, wherever they come from.
function assertTypography(text, where) {
  const bad = text.match(/[\u2013\u2014]/);
  if (bad) throw new Error(`${where} contains a banned dash character near: ${text.slice(Math.max(0, bad.index - 40), bad.index + 40)}`);
}

async function write(rel, content) {
  const file = join(out, rel);
  await mkdir(dirname(file), { recursive: true });
  if (typeof content === 'string') assertTypography(content, rel);
  await writeFile(file, content);
}

async function writeRoot(rel, content) {
  const file = join(root, rel);
  await mkdir(dirname(file), { recursive: true });
  assertTypography(content, rel);
  await writeFile(file, content);
}

// ------------------------------------------------------------------ icons and brand

const ICON = {
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#0b1117"/><path d="M7 21.5l6-7 5 4 7.5-9.5" fill="none" stroke="#2fd08a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="25.5" cy="9" r="2.4" fill="#2fd08a"/></svg>`,
  github: `<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`,
  check: `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>`,
  key: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg>`,
  code: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>`,
  sliders: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>`,
  plug: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 01-12 0zM12 17v5"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`,
};

// ------------------------------------------------------------------ docs

const DOC_NAV = [
  { group: 'Start', items: ['getting-started'] },
  { group: 'Connect your AI', items: ['claude', 'chatgpt', 'codex', 'cursor', 'vscode', 'gemini', 'other-clients'] },
  { group: 'Reference', items: ['tools', 'security', 'rest-api', 'cli', 'self-hosting', 'faq'] },
];
const NAV_LABEL = {
  'getting-started': 'Getting started',
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  codex: 'OpenAI Codex',
  cursor: 'Cursor',
  vscode: 'VS Code',
  gemini: 'Gemini CLI',
  'other-clients': 'Other clients',
  tools: 'Tool reference',
  security: 'Security model',
  'rest-api': 'REST API',
  cli: 'Local CLI',
  'self-hosting': 'Self-hosting',
  faq: 'FAQ',
};
const docPath = (slug) => (slug === 'getting-started' ? '/docs/' : slug === 'privacy' ? '/privacy' : `/docs/${slug}`);

function parseFrontmatter(src, file) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(src);
  if (!m) throw new Error(`${file} is missing frontmatter`);
  const meta = Object.fromEntries(
    m[1].split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
  if (!meta.title || !meta.description) throw new Error(`${file} needs title and description`);
  return { meta, body: src.slice(m[0].length) };
}

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

function markdown() {
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        if (depth === 1) return `<h1>${inner}</h1>\n`;
        const id = slugify(inner);
        return `<h${depth} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const m = /^([a-z-]+)\.md(#.*)?$/.exec(href);
        const target = m ? `${docPath(m[1])}${m[2] ?? ''}` : href;
        const external = /^https?:\/\//.test(target) && !target.startsWith(SITE);
        return `<a href="${esc(target)}"${title ? ` title="${esc(title)}"` : ''}${external ? ' rel="noopener"' : ''}>${text}</a>`;
      },
      table(token) {
        const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const rows = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
        return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>\n`;
      },
    },
  });
  return md;
}

/** docs/tools.md is generated from the registry so the reference always matches the code. */
async function generateToolsDoc() {
  const groups = [
    { title: 'Markets and analytics', note: 'No wallet needed.', match: (t) => t.access === 'public' && ['get_markets', 'get_price_chart', 'get_protocol_stats', 'get_liquidation_map', 'get_leaderboard', 'get_top_trades', 'get_recent_trades'].includes(t.name) },
    { title: 'Accounts', note: 'Any wallet by address, or the connected wallet by default.', match: (t) => ['get_account', 'get_trade_history', 'get_portfolio_history', 'get_deposit_info', 'get_trading_permissions'].includes(t.name) },
    { title: 'Planning', note: 'Pure math with live prices.', match: (t) => t.name === 'calculate_position' },
    { title: 'Trading', note: 'Previewing, opening, closing and cancelling need a trading session approved by the wallet owner, with guardrails enforced on the server. Intent status is public.', match: (t) => ['preview_trade', 'open_position', 'close_positions', 'cancel_intent', 'get_intent_status'].includes(t.name) },
  ];
  const used = new Set();
  const typeOf = (s) => {
    if (s.enum) return s.enum.map((v) => `\`${v}\``).join(', ');
    if (s.anyOf) return s.anyOf.map(typeOf).join(' or ');
    if (s.type === 'array') return `array of ${s.items ? typeOf(s.items) : 'values'}`;
    if (s.type === 'integer') return `integer${s.minimum !== undefined ? ` ${s.minimum}` : ''}${s.maximum !== undefined ? ` to ${s.maximum}` : ''}`;
    if (s.type === 'number') return `number${s.exclusiveMinimum === 0 ? ' > 0' : ''}`;
    if (s.pattern === '^0x[0-9a-fA-F]{40}$') return 'address';
    return s.type ?? 'value';
  };
  let md = `---\ntitle: Tool reference\ndescription: Every Papertrade AI tool with its inputs, access level and safety annotations. Markets, charts, liquidation maps, leaderboards, wallet analytics, previews and guarded trading.\n---\n\n# Tool reference\n\n<!-- Generated by scripts/build-site.mjs from src/tools/registry.ts. Do not edit by hand. -->\n\nPapertrade AI exposes ${TOOLS.length} tools. Every tool returns a one-line \`summary\` the model can relay and a structured \`data\` object. Public tools also work over the [REST API](rest-api.md) and the unauthenticated endpoint \`${PUBLIC_MCP_URL}\`.\n\n| Tool | What it does | Access |\n| --- | --- | --- |\n`;
  for (const t of TOOLS) md += `| [\`${t.name}\`](#${t.name.replace(/_/g, '_')}) | ${t.title} | ${t.access === 'trade' ? 'trading session' : 'public'} |\n`;
  for (const g of groups) {
    const tools = TOOLS.filter((t) => !used.has(t.name) && g.match(t));
    if (!tools.length) continue;
    md += `\n## ${g.title}\n\n${g.note}\n`;
    for (const t of tools) {
      used.add(t.name);
      const schema = z.toJSONSchema(t.input, { io: 'input' });
      const props = Object.entries(schema.properties ?? {});
      const required = new Set(schema.required ?? []);
      const hints = [t.annotations.readOnlyHint ? 'read-only' : 'writes', t.annotations.destructiveHint ? 'destructive (clients ask before running)' : null, t.annotations.idempotentHint ? 'idempotent' : null].filter(Boolean).join(', ');
      md += `\n### ${t.name}\n\n**${t.title}.** ${t.description}\n\n- Access: ${t.access === 'trade' ? 'trading session' : 'public'}\n- Annotations: ${hints}\n`;
      if (props.length) {
        md += `\n| Input | Type | Required | Default | Description |\n| --- | --- | --- | --- | --- |\n`;
        for (const [k, s] of props) md += `| \`${k}\` | ${typeOf(s)} | ${required.has(k) && s.default === undefined ? 'yes' : 'no'} | ${s.default !== undefined ? `\`${JSON.stringify(s.default)}\`` : ''} | ${(s.description ?? '').replace(/\|/g, '\\|')} |\n`;
      } else md += `\nNo inputs.\n`;
    }
  }
  const missing = TOOLS.filter((t) => !used.has(t.name)).map((t) => t.name);
  if (missing.length) throw new Error(`Tools missing from the reference groups: ${missing.join(', ')}`);
  await writeRoot('docs/tools.md', md);
}

// ------------------------------------------------------------------ page shell

function head({ title, description, path, type = 'website', jsonld = [], extra = '' }) {
  const url = `${SITE}${path}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#07090c" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="color-scheme" content="light dark">
<meta name="author" content="nirholas">
<meta name="keywords" content="Papertrade, MCP server, Model Context Protocol, AI trading, perpetual futures, perps, BTC, ETH, HyperEVM, Hyperliquid, Claude, ChatGPT, Codex, Cursor, Gemini CLI, VS Code, crypto trading bot, session keys">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${NAME}: ${TAGLINE}. Claude, ChatGPT, Codex, Cursor, Gemini and VS Code.">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE}/og.png">
<meta name="twitter:image:alt" content="${NAME}: ${TAGLINE}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt">
<link rel="alternate" type="application/json" title="OpenAPI" href="/openapi.json">
<link rel="preload" href="/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css?v=${VERSION}">
${extra}${jsonld.map((j) => `<script type="application/ld+json">${ldJson(j)}</script>`).join('\n')}
</head>`;
}

function header(current) {
  const link = (href, label, key, cls = '') => `<a href="${href}"${cls ? ` class="${cls}"` : ''}${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
<a class="brand" href="/" aria-label="${NAME} home">${ICON.logo}<span>${NAME}</span></a>
<nav class="nav" aria-label="Primary">
${link('/#install', 'Install', 'install', 'hide-sm')}
${link('/docs/', 'Docs', 'docs')}
${link('/docs/tools', 'Tools', 'tools', 'hide-sm')}
${link('/docs/security', 'Security', 'security', 'hide-sm')}
<a class="btn sm" href="${REPO}" rel="noopener">${ICON.github}<span>GitHub</span></a>
</nav>
</div></header>`;
}

function footer() {
  return `<footer class="site"><div class="wrap">
<div class="cols">
<div>
<a class="brand" href="/">${ICON.logo}<span>${NAME}</span></a>
<p class="foot-about">${esc(SHORT)} Open source, MIT licensed.</p>
</div>
<div><h4>Connect</h4><ul>
<li><a href="/docs/claude">Claude</a></li><li><a href="/docs/chatgpt">ChatGPT</a></li><li><a href="/docs/codex">Codex</a></li><li><a href="/docs/cursor">Cursor</a></li><li><a href="/docs/vscode">VS Code</a></li><li><a href="/docs/gemini">Gemini CLI</a></li><li><a href="/docs/other-clients">Other clients</a></li>
</ul></div>
<div><h4>Developers</h4><ul>
<li><a href="/docs/tools">Tool reference</a></li><li><a href="/docs/rest-api">REST API</a></li><li><a href="/openapi.json">OpenAPI</a></li><li><a href="/docs/cli">Local CLI</a></li><li><a href="/docs/self-hosting">Self-hosting</a></li><li><a href="/llms.txt">llms.txt</a></li>
</ul></div>
<div><h4>Project</h4><ul>
<li><a href="${REPO}" rel="noopener">GitHub</a></li><li><a href="${NPM}" rel="noopener">npm</a></li><li><a href="https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(REGISTRY_NAME)}" rel="noopener">MCP Registry</a></li><li><a href="/docs/security">Security</a></li><li><a href="/account">Manage connected apps</a></li><li><a href="/privacy">Privacy</a></li>
</ul></div>
</div>
<p class="legal">${NAME} is independent open-source software and is not affiliated with Papertrade. Perpetual futures at up to 1000x leverage can lose your full margin in seconds. Nothing here is financial advice. v${VERSION}.</p>
</div></footer>`;
}

const PERSON = { '@type': 'Person', name: 'nirholas', url: 'https://github.com/nirholas' };
const APP_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: NAME,
  alternateName: ['papertrade-ai', 'Papertrade MCP server'],
  description: DESCRIPTION,
  url: `${SITE}/`,
  image: `${SITE}/og.png`,
  applicationCategory: 'FinanceApplication',
  applicationSubCategory: 'MCP server',
  operatingSystem: 'Any (remote MCP), macOS, Windows, Linux (Node.js 20+)',
  softwareVersion: VERSION,
  license: 'https://opensource.org/licenses/MIT',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: PERSON,
  downloadUrl: NPM,
  installUrl: `${SITE}/#install`,
  codeRepository: REPO,
  sameAs: [REPO, NPM],
  featureList: TOOLS.map((t) => `${t.title}: ${t.description.split('. ')[0]}`),
};

// ------------------------------------------------------------------ landing page

const INSTALL = [
  {
    id: 'claude',
    label: 'Claude',
    title: 'Claude.ai, Claude Desktop and mobile',
    body: `<ol>
<li>Open <strong>Settings, Connectors</strong> and click <strong>Add custom connector</strong>.</li>
<li>Name it <strong>Papertrade</strong> and paste the server URL. Leave the OAuth fields empty.</li>
<li>Click <strong>Connect</strong>, pick <strong>Read only</strong> or <strong>Trade with guardrails</strong>, and sign with your wallet.</li>
</ol>`,
    actions: `<a class="btn primary" href="${LINKS.claudeConnectors}" rel="noopener">Open Claude connectors</a><button class="btn" type="button" data-copy="${MCP_URL}">Copy server URL</button><a class="btn" href="/docs/claude">Full guide</a>`,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    title: 'ChatGPT apps (developer mode)',
    body: `<ol>
<li>In <strong>Settings, Apps, Advanced settings</strong>, turn on <strong>Developer mode</strong>.</li>
<li>Click <strong>Create app</strong>, paste the server URL, choose <strong>OAuth</strong>, and create it.</li>
<li>Sign in with your wallet, then enable Papertrade from the <strong>+</strong> menu in a chat.</li>
</ol>
<p class="muted mt-12">Building a custom GPT instead? Import <code>${SITE}/openapi.json</code> as an Action.</p>`,
    actions: `<a class="btn primary" href="${LINKS.chatgpt}" rel="noopener">Open ChatGPT</a><button class="btn" type="button" data-copy="${MCP_URL}">Copy server URL</button><a class="btn" href="/docs/chatgpt">Full guide</a>`,
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    title: 'Claude Code',
    body: `<p class="muted">Plugin with the server, a trading skill and slash commands:</p>
<pre><code>/plugin marketplace add nirholas/papertrade-ai
/plugin install papertrade-ai@papertrade-ai</code></pre>
<p class="muted">Or just the server:</p>
<pre><code>claude mcp add --transport http papertrade ${MCP_URL}</code></pre>`,
    actions: `<a class="btn" href="/docs/claude#claude-code">Full guide</a>`,
  },
  {
    id: 'codex',
    label: 'Codex',
    title: 'OpenAI Codex CLI and IDE',
    body: `<pre><code>codex mcp add papertrade --url ${MCP_URL}
codex mcp login papertrade</code></pre>`,
    actions: `<a class="btn" href="/docs/codex">Full guide</a>`,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    title: 'Cursor',
    body: `<p class="muted">One click, then press <strong>Connect</strong> next to Papertrade in Settings, MCP.</p>
<pre><code>{
  "mcpServers": {
    "papertrade": { "url": "${MCP_URL}" }
  }
}</code></pre>`,
    actions: `<a href="${esc(LINKS.cursor)}" rel="noopener" aria-label="Add Papertrade AI to Cursor"><img class="badge-img" src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Add to Cursor" width="126" height="32"></a><a class="btn" href="/docs/cursor">Full guide</a>`,
  },
  {
    id: 'vscode',
    label: 'VS Code',
    title: 'VS Code with GitHub Copilot',
    body: `<p class="muted">One click, or from a terminal:</p>
<pre><code>code --add-mcp '{"name":"papertrade","type":"http","url":"${MCP_URL}"}'</code></pre>`,
    actions: `<a class="btn primary" href="${esc(LINKS.vscode)}" rel="noopener">Install in VS Code</a><a class="btn" href="${esc(LINKS.vscodeInsiders)}" rel="noopener">VS Code Insiders</a><a class="btn" href="/docs/vscode">Full guide</a>`,
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    title: 'Gemini CLI',
    body: `<pre><code>gemini extensions install ${REPO}</code></pre>
<p class="muted">Then run <code>/mcp auth papertrade</code> inside Gemini CLI.</p>`,
    actions: `<a class="btn" href="/docs/gemini">Full guide</a>`,
  },
  {
    id: 'local',
    label: 'Local (npx)',
    title: 'Run it on your machine',
    body: `<p class="muted">Keys stay on your disk. Works with any client that runs stdio servers.</p>
<pre><code>npx -y papertrade-ai login
npx -y papertrade-ai</code></pre>`,
    actions: `<a class="btn" href="/docs/cli">CLI guide</a><a class="btn" href="${NPM}" rel="noopener">npm</a>`,
  },
];

const PROMPTS = [
  ['What are BTC and ETH doing on Papertrade right now?', 'Live markets, open interest and caps'],
  ['Show me the Papertrade liquidation map for ETH.', 'Where longs and shorts get wiped'],
  ['Who are the top 10 Papertrade traders this week? What are they holding?', 'Leaderboard plus live positions'],
  ['Analyze wallet 0x... on Papertrade: win rate, biggest trade, equity curve.', 'Any wallet, no login'],
  ['If I long BTC with $20 at 500x, where is my liquidation price?', 'Exact exchange math'],
  ['Preview a $15 ETH short at 800x, then open it if I confirm.', 'Guarded trading'],
  ['Close all my BTC positions.', 'Batch closes at market'],
  ['How much of my daily trading limit is left?', 'Your guardrails, live'],
];

const FAQ = [
  ['Is Papertrade AI official?', 'No. It is an independent open-source project, MIT licensed, not affiliated with Papertrade. It uses the same public endpoints and the same signed messages as the official web app.'],
  ['Can the AI withdraw my funds?', 'No. The trading session key can only open, close and cancel Papertrade positions; the exchange contract does not let it withdraw or transfer. On top of that the server enforces the limits you set: margin per trade, leverage, daily size, open positions and markets.'],
  ['Does "Papertrade" mean fake money?', 'No. Positions use real USDC deposited to your Papertrade account and losses are real. At 1000x a 0.1% move against you liquidates the position.'],
  ['Which AI apps work?', 'Claude (web, desktop, mobile, Claude Code), ChatGPT, OpenAI Codex, Cursor, VS Code with Copilot, Gemini CLI, Windsurf, Zed, Cline, Goose, LibreChat and any MCP client over Streamable HTTP or stdio.'],
  ['Do I need to connect a wallet?', 'Only for your own account and for trading. Markets, charts, the liquidation map, leaderboards and any wallet lookup work without connecting.'],
  ['What does it cost?', 'Papertrade AI is free. Papertrade charges a one-time 1 USDC activation fee on the first deposit and a 2% fee on winning trades.'],
  ['How do I revoke access?', 'Open the Manage connected apps page, sign a free message with your wallet, and click Revoke. Tokens and the session key are deleted immediately.'],
];

function landing() {
  const toolsByAccess = TOOLS.map(
    (t) => `<a class="card tool" href="/docs/tools#${t.name}"><div class="name"><code>${t.name}</code><span class="pill ${t.access === 'trade' ? 'trade' : 'public'}">${t.access === 'trade' ? 'Trading' : 'Public'}</span></div><strong>${esc(t.title)}</strong><p>${esc(t.description.split('. ')[0].replace(/\.$/, ''))}.</p></a>`,
  ).join('\n');
  const tabs = INSTALL.map((t, i) => `<button role="tab" type="button" id="install-${t.id}" aria-controls="panel-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(t.label)}</button>`).join('');
  const panels = INSTALL.map((t, i) => `<div class="panel" role="tabpanel" id="panel-${t.id}" aria-labelledby="install-${t.id}"${i ? ' hidden' : ''}><h3>${esc(t.title)}</h3>${t.body}<div class="actions">${t.actions}</div></div>`).join('\n');
  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const siteLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, url: `${SITE}/`, description: DESCRIPTION, publisher: PERSON };
  const howLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: 'Connect Papertrade AI to Claude, ChatGPT or any MCP client',
    totalTime: 'PT1M',
    step: [
      { '@type': 'HowToStep', name: 'Add the server', text: `Add ${MCP_URL} as a custom connector or MCP server in your AI app.` },
      { '@type': 'HowToStep', name: 'Connect your wallet', text: 'Choose read only, or trade with guardrails, and sign once with your wallet.' },
      { '@type': 'HowToStep', name: 'Ask', text: 'Ask about markets, wallets and liquidations, or preview and confirm a trade.' },
    ],
  };
  return `${head({ title: `${NAME}: ${TAGLINE}. Papertrade MCP for Claude, ChatGPT, Codex and Cursor`, description: DESCRIPTION, path: '/', jsonld: [APP_LD, siteLd, faqLd, howLd] })}
<body>
${header('home')}
<main id="main">
<div class="wrap">
<div class="hero"><div class="hero-grid">
<div>
<span class="eyebrow"><span class="dot"></span>Open-source MCP server for Papertrade</span>
<h1><span class="grad">Trade perps</span><br>from any AI.</h1>
<p class="lede">Connect Claude, ChatGPT, Codex, Cursor, Gemini or VS Code to Papertrade's BTC and ETH perpetuals. Your AI reads live markets and any wallet, previews every trade, and trades only inside the limits you set. Your wallet signs once. The key it creates cannot withdraw.</p>
<div class="urlbox"><span class="label">MCP</span><code id="mcp-url">${MCP_URL}</code><button class="copy" type="button" data-copy="${MCP_URL}">Copy</button></div>
<div class="cta">
<a class="btn primary" href="#install">${ICON.plug}Add to your AI</a>
<a class="btn" href="/docs/">${ICON.book}Read the docs</a>
<a class="btn" href="${REPO}" rel="noopener">${ICON.github}Star on GitHub</a>
</div>
<div class="trust">
<span>${ICON.check}Free, MIT licensed</span><span>${ICON.check}Non-custodial session keys</span><span>${ICON.check}OAuth 2.1, no API keys</span><span>${ICON.check}${TOOLS.length} tools</span>
</div>
</div>
<div class="live" id="live" aria-live="polite">
<div class="live-head"><h2><span class="pulse" aria-hidden="true"></span>Papertrade live</h2>
<div class="seg" role="group" aria-label="Market"><button type="button" data-market="BTC" aria-pressed="true">BTC</button><button type="button" data-market="ETH" aria-pressed="false">ETH</button></div></div>
<div class="quote"><span class="px num sk" id="lv-px">000000</span><span class="chg num" id="lv-chg"></span></div>
<div class="chart" id="lv-chart"></div>
<dl class="kv">
<div><dt>Max leverage</dt><dd class="num sk" id="lv-lev">1000x</dd></div>
<div><dt>24h volume</dt><dd class="num sk" id="lv-vol">$000B</dd></div>
<div><dt>Min margin / size</dt><dd class="num sk" id="lv-min">$10 / $10K</dd></div>
<div><dt>Market</dt><dd class="sk" id="lv-status">Open</dd></div>
</dl>
<div class="oi"><div class="row"><span id="lv-oi-lt">Longs</span><span id="lv-oi-st">Shorts</span></div><div class="oibar" aria-hidden="true"><span id="lv-oi-l"></span><span id="lv-oi-s"></span></div></div>
<div class="err" id="lv-err" hidden><span id="lv-err-msg"></span> <button class="btn sm" type="button" id="lv-retry">Retry</button></div>
<div class="live-foot"><span id="lv-time">Loading live data</span><a id="lv-tv" href="https://www.tradingview.com/" rel="noopener">Open in TradingView</a></div>
</div>
</div></div>

<div class="stats" id="stats" aria-label="Papertrade protocol stats">
<div class="stat"><b class="num sk" id="st-tvl">$000M</b><span>Total value locked</span></div>
<div class="stat"><b class="num sk" id="st-vol">$000B</b><span>Lifetime volume</span></div>
<div class="stat"><b class="num sk" id="st-pos">0000</b><span>Open positions</span></div>
<div class="stat"><b class="num sk" id="st-fees">$00M</b><span>Lifetime fees</span></div>
</div>
</div>

<section id="install"><div class="wrap">
<p class="kicker">Install</p>
<h2 class="title">One URL. Every assistant.</h2>
<p class="sub">Remote server with OAuth, so there is nothing to install and no API key to paste. Prefer local? It is one <code>npx</code> away.</p>
<div class="tabs" role="tablist" aria-label="Choose your AI app">${tabs}</div>
${panels}
</div></section>

<section id="how" class="alt"><div class="wrap">
<p class="kicker">How it works</p>
<h2 class="title">Sign once. Trade by asking.</h2>
<p class="sub">The same flow the official Papertrade app uses for one-click trading, with an AI and your guardrails in the loop.</p>
<div class="steps">
<div class="card step"><h3>Connect</h3><p>Your AI opens a Papertrade AI page. Connect any browser wallet and choose read only, or trading.</p></div>
<div class="card step"><h3>Set guardrails</h3><p>Max margin per trade, max leverage, daily size, open positions, markets, and whether every trade needs your yes. One EIP-712 signature registers a 30-day session key.</p></div>
<div class="card step"><h3>Ask</h3><p>"Long ETH with $20 at 500x." Your AI previews entry, liquidation price and PnL scenarios, waits for your confirmation, then trades.</p></div>
</div>
</div></section>

<section id="safety"><div class="wrap">
<p class="kicker">Safety</p>
<h2 class="title">Built for the worst prompt, not the best one.</h2>
<p class="sub">What a confused or manipulated model can do is bounded by limits you choose, enforced in code the model cannot reach.</p>
<div class="grid c3">
<div class="card"><div class="ico">${ICON.key}</div><h3>Keys that cannot withdraw</h3><p>The session key can open, close and cancel positions. The exchange contract does not let it withdraw or transfer anything.</p></div>
<div class="card"><div class="ico">${ICON.sliders}</div><h3>Guardrails on the server</h3><p>Margin, leverage, rolling 24h size, open positions and markets are checked before any intent is signed.</p></div>
<div class="card"><div class="ico">${ICON.eye}</div><h3>Preview, then confirm</h3><p>Opening is two calls. The second needs a signed quote for the identical trade, valid for three minutes.</p></div>
<div class="card"><div class="ico">${ICON.lock}</div><h3>Encrypted per app</h3><p>Each app's session key is encrypted with a key derived from that app's own access token.</p></div>
<div class="card"><div class="ico">${ICON.undo}</div><h3>Revoke in one click</h3><p>Sign in on the account page and revoke any app. Tokens and keys are deleted on the spot.</p></div>
<div class="card"><div class="ico">${ICON.code}</div><h3>Open source</h3><p>Every line is on GitHub under MIT. Run it locally with npx or deploy your own Worker.</p></div>
</div>
</div></section>

<section id="prompts" class="alt"><div class="wrap">
<p class="kicker">Try asking</p>
<h2 class="title">Things to say to your AI</h2>
<p class="sub">Click any prompt to copy it.</p>
<div class="prompts">
${PROMPTS.map(([p, h]) => `<button class="prompt" type="button" data-copy="${esc(p)}">${ICON.chat}<span>${esc(p)}<small data-hint="${esc(h)}">${esc(h)}</small></span></button>`).join('\n')}
</div>
</div></section>

<section id="tools"><div class="wrap">
<p class="kicker">Tools</p>
<h2 class="title">${TOOLS.length} tools. Markets to execution.</h2>
<p class="sub">Every tool returns a summary your AI can say out loud and structured data it can reason over. On Claude, ChatGPT, VS Code and Goose the results render as a live trading card.</p>
<div class="grid c3">
${toolsByAccess}
</div>
</div></section>

<section id="developers" class="alt"><div class="wrap">
<p class="kicker">Developers</p>
<h2 class="title">Not using MCP? Use HTTPS.</h2>
<p class="sub">Every public tool is a REST endpoint with open CORS and an OpenAPI 3.1 document, for GPT Actions, agent frameworks, bots and dashboards.</p>
<div class="grid c2">
<div><pre><code>curl ${SITE}/api/v1/tools/get_markets

curl "${SITE}/api/v1/tools/get_liquidation_map?market=ETH"</code></pre></div>
<div class="grid">
<a class="card" href="/docs/rest-api"><div class="ico">${ICON.bolt}</div><h3>REST API</h3><p>GET or POST any public tool. Authenticated tools with an OAuth token.</p></a>
<a class="card" href="/docs/self-hosting"><div class="ico">${ICON.terminal}</div><h3>Self-host and npm</h3><p>Deploy your own Cloudflare Worker, or import the tool registry from the npm package.</p></a>
</div>
</div>
</div></section>

<section id="faq"><div class="wrap">
<p class="kicker">FAQ</p>
<h2 class="title">Questions</h2>
${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
<p class="mt-24"><a href="/docs/faq">All questions</a></p>
<div class="risk mt-40"><strong>Risk.</strong> Papertrade offers up to 1000x leverage. At that leverage a 0.1% move against you liquidates the position and the full margin is lost. ${NAME} is open-source software, not financial advice, and is not affiliated with Papertrade.</div>
</div></section>
</main>
${footer()}
<script src="/site.js?v=${VERSION}" type="module"></script>
</body>
</html>`;
}

// ------------------------------------------------------------------ docs pages

async function buildDocs() {
  await generateToolsDoc();
  const md = markdown();
  const files = (await readdir(join(root, 'docs'))).filter((f) => f.endsWith('.md'));
  const pages = new Map();
  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    const src = await readFile(join(root, 'docs', f), 'utf8');
    assertTypography(src, `docs/${f}`);
    pages.set(slug, { slug, ...parseFrontmatter(src, f), src });
  }
  const ordered = DOC_NAV.flatMap((g) => g.items);
  for (const slug of ordered) if (!pages.has(slug)) throw new Error(`docs/${slug}.md is in the nav but missing`);
  for (const slug of pages.keys()) if (!ordered.includes(slug) && slug !== 'privacy') throw new Error(`docs/${slug}.md is not in the docs nav`);

  const side = (current) =>
    `<nav class="side" aria-label="Documentation">${DOC_NAV.map((g) => `<h4>${g.group}</h4><ul>${g.items.map((s) => `<li><a href="${docPath(s)}"${s === current ? ' aria-current="page"' : ''}>${NAV_LABEL[s]}</a></li>`).join('')}</ul>`).join('')}</nav>`;

  for (const page of pages.values()) {
    const { slug, meta, body } = page;
    const html = md.parse(body);
    const path = docPath(slug);
    const i = ordered.indexOf(slug);
    const prev = i > 0 ? ordered[i - 1] : null;
    const next = i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : null;
    const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: NAME, item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: 'Docs', item: `${SITE}/docs/` }, ...(slug === 'getting-started' ? [] : [{ '@type': 'ListItem', position: 3, name: meta.title, item: `${SITE}${path}` }])] };
    const article = { '@context': 'https://schema.org', '@type': 'TechArticle', headline: meta.title, description: meta.description, url: `${SITE}${path}`, image: `${SITE}/og.png`, author: PERSON, publisher: PERSON, dateModified: TODAY, isPartOf: { '@type': 'WebSite', name: NAME, url: `${SITE}/` }, about: { '@type': 'SoftwareApplication', name: NAME } };
    const mdPath = slug === 'privacy' ? '/privacy.md' : `/docs/${slug}.md`;
    const doc = `${head({ title: `${meta.title} | ${NAME}`, description: meta.description, path, type: 'article', jsonld: [article, crumbs], extra: `<link rel="alternate" type="text/markdown" title="Markdown" href="${mdPath}">\n` })}
<body>
${header(slug === 'tools' ? 'tools' : slug === 'security' ? 'security' : 'docs')}
<div class="wrap docs">
${slug === 'privacy' ? '<div></div>' : side(slug)}
<main id="main" class="prose">
${html.replace(/<h1>(.*?)<\/h1>/, `<h1>$1</h1>\n<p class="desc">${esc(meta.description)}</p>`)}
${prev || next ? `<nav class="pager" aria-label="Pagination">${prev ? `<a href="${docPath(prev)}"><small>Previous</small>${NAV_LABEL[prev]}</a>` : '<span></span>'}${next ? `<a class="next" href="${docPath(next)}"><small>Next</small>${NAV_LABEL[next]}</a>` : ''}</nav>` : ''}
<a class="edit" href="${REPO}/edit/main/docs/${slug}.md" rel="noopener">Edit this page on GitHub</a>
</main>
</div>
${footer()}
<script src="/site.js?v=${VERSION}" type="module"></script>
</body>
</html>`;
    const file = slug === 'getting-started' ? 'docs/index.html' : slug === 'privacy' ? 'privacy.html' : `docs/${slug}.html`;
    await write(file, doc);
    await write(mdPath.slice(1), page.src);
  }
  return { pages, ordered };
}

// ------------------------------------------------------------------ images

const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
<radialGradient id="g1" cx="0.12" cy="0.1" r="0.7"><stop offset="0" stop-color="#2fd08a" stop-opacity=".30"/><stop offset="1" stop-color="#2fd08a" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="0.95" cy="0.0" r="0.6"><stop offset="0" stop-color="#7aa2ff" stop-opacity=".22"/><stop offset="1" stop-color="#7aa2ff" stop-opacity="0"/></radialGradient>
<linearGradient id="t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2fd08a"/><stop offset=".6" stop-color="#5ae3a5"/><stop offset="1" stop-color="#7aa2ff"/></linearGradient>
<linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fd08a" stop-opacity=".25"/><stop offset="1" stop-color="#2fd08a" stop-opacity="0"/></linearGradient>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity=".04"/></pattern>
</defs>
<rect width="1200" height="630" fill="#07090c"/>
<rect width="1200" height="630" fill="url(#grid)"/>
<rect width="1200" height="630" fill="url(#g1)"/>
<rect width="1200" height="630" fill="url(#g2)"/>
<path d="M640 470 L700 452 L745 466 L800 420 L850 432 L900 380 L950 396 L1010 330 L1060 346 L1120 270 L1200 250 L1200 630 L640 630 Z" fill="url(#area)"/>
<path d="M640 470 L700 452 L745 466 L800 420 L850 432 L900 380 L950 396 L1010 330 L1060 346 L1120 270 L1200 250" fill="none" stroke="#2fd08a" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
<g transform="translate(72 70)">
<rect width="56" height="56" rx="15" fill="#0f151c" stroke="#1f2833"/>
<path d="M12.5 37.5l10.5-12.2 8.8 7 13.1-16.6" fill="none" stroke="#2fd08a" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="44.6" cy="15.7" r="4.1" fill="#2fd08a"/>
<text x="74" y="38" font-family="Inter" font-weight="600" font-size="28" fill="#e8ecf1">Papertrade AI</text>
</g>
<text x="72" y="250" font-family="Inter Display" font-weight="700" font-size="92" letter-spacing="-3.5" fill="url(#t)">Trade perps</text>
<text x="72" y="350" font-family="Inter Display" font-weight="700" font-size="92" letter-spacing="-3.5" fill="#ffffff">from any AI.</text>
<text x="74" y="412" font-family="Inter" font-size="27" fill="#9aa4b2">Papertrade BTC and ETH perps, up to 1000x, from chat.</text>
<g font-family="Inter" font-weight="600" font-size="20" fill="#e8ecf1">
${['Claude', 'ChatGPT', 'Codex', 'Cursor', 'Gemini', 'VS Code']
  .reduce(
    (acc, label) => {
      const w = Math.round(label.length * 11.2 + 34);
      acc.parts.push(`<g transform="translate(${acc.x} 470)"><rect width="${w}" height="44" rx="22" fill="#10161d" stroke="#243040"/><text x="${w / 2}" y="29" text-anchor="middle">${label}</text></g>`);
      acc.x += w + 10;
      return acc;
    },
    { x: 72, parts: [] },
  )
  .parts.join('')}
</g>
<text x="74" y="572" font-family="Inter" font-weight="600" font-size="22" fill="#2fd08a">MCP server</text>
<text x="210" y="572" font-family="Inter" font-size="22" fill="#6b7483">${HOST}/mcp</text>
</svg>`;

const ICON_SVG = (size, radius = 0.28) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
<defs><radialGradient id="r" cx=".2" cy=".1" r=".9"><stop offset="0" stop-color="#2fd08a" stop-opacity=".28"/><stop offset="1" stop-color="#2fd08a" stop-opacity="0"/></radialGradient></defs>
<rect width="64" height="64" rx="${64 * radius}" fill="#0b1117"/><rect width="64" height="64" rx="${64 * radius}" fill="url(#r)"/>
<path d="M14 43l12-14 10 8 15-19" fill="none" stroke="#2fd08a" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="51" cy="18" r="4.6" fill="#2fd08a"/></svg>`;

const FONT_FILES = ['Inter-Regular.ttf', 'Inter-SemiBold.ttf', 'InterDisplay-Bold.ttf'].map((f) => join(root, 'site/fonts', f));
function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng();
}

async function buildImages() {
  assertTypography(OG_SVG, 'og.svg');
  await write('og.png', png(OG_SVG, 1200));
  await write('icon-512.png', png(ICON_SVG(512), 512));
  await write('icon-192.png', png(ICON_SVG(192), 192));
  await write('apple-touch-icon.png', png(ICON_SVG(180, 0), 180));
  await write('favicon-32.png', png(ICON_SVG(32), 32));
  await write('logo-400.png', png(ICON_SVG(400), 400));
  await write('favicon.svg', ICON_SVG(64));
  // Assets used outside the site: the repo social preview and the MCPB bundle icon.
  await mkdir(join(root, 'build'), { recursive: true });
  await writeFile(join(root, 'build/og.png'), png(OG_SVG, 1280));
  await writeFile(join(root, 'build/icon.png'), png(ICON_SVG(512), 512));
}

// ------------------------------------------------------------------ discovery files

function serverCard() {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json',
    name: REGISTRY_NAME,
    version: VERSION,
    title: NAME,
    description: DESCRIPTION,
    websiteUrl: `${SITE}/`,
    repository: { url: REPO, source: 'github' },
    icons: [
      { src: `${SITE}/icon-512.png`, mimeType: 'image/png', sizes: ['512x512'] },
      { src: `${SITE}/favicon.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
    ],
    remotes: [{ type: 'streamable-http', url: MCP_URL, supportedProtocolVersions: ['2025-06-18', '2025-11-25'] }],
    _meta: {
      'io.github.nirholas/papertrade-ai': {
        publicEndpoint: PUBLIC_MCP_URL,
        authorization: { type: 'oauth2', protectedResourceMetadata: `${SITE}/.well-known/oauth-protected-resource`, scopes: ['trade:read', 'trade:write', 'offline_access'] },
        npm: 'papertrade-ai',
        openapi: `${SITE}/openapi.json`,
        documentation: `${SITE}/docs/`,
        tools: TOOLS.map((t) => ({ name: t.name, title: t.title, access: t.access })),
      },
    },
  };
}

function registryServerJson() {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: REGISTRY_NAME,
    title: NAME,
    description: 'Trade Papertrade BTC and ETH perps from Claude, ChatGPT, Codex, Cursor and any MCP client.',
    version: VERSION,
    websiteUrl: `${SITE}/`,
    repository: { url: REPO, source: 'github' },
    icons: [{ src: `${SITE}/icon-512.png`, mimeType: 'image/png', sizes: ['512x512'] }],
    packages: [
      {
        registryType: 'npm',
        registryBaseUrl: 'https://registry.npmjs.org',
        identifier: pkg.name,
        version: VERSION,
        transport: { type: 'stdio' },
        environmentVariables: [
          { name: 'PAPERTRADE_WALLET', description: 'Wallet address for read-only access without logging in.', isRequired: false, isSecret: false, format: 'string' },
          { name: 'PAPERTRADE_PRIVATE_KEY', description: 'Optional wallet key for headless trading. Only used to sign a session key registration; never stored.', isRequired: false, isSecret: true, format: 'string' },
        ],
      },
    ],
    remotes: [{ type: 'streamable-http', url: MCP_URL }],
  };
}

async function buildDiscovery(pages, ordered) {
  const card = serverCard();
  await write('.well-known/mcp/server-card.json', JSON.stringify(card, null, 2));
  await write(
    '.well-known/ai-catalog.json',
    JSON.stringify({ specVersion: '1.0', entries: [{ identifier: `urn:air:${HOST}:mcp:papertrade-ai`, type: 'application/mcp-server-card+json', url: `${SITE}/.well-known/mcp/server-card.json` }] }, null, 2),
  );
  await write(
    '.well-known/ai-plugin.json',
    JSON.stringify(
      {
        schema_version: 'v1',
        name_for_human: NAME,
        name_for_model: 'papertrade',
        description_for_human: SHORT,
        description_for_model:
          'Live Papertrade (BTC and ETH perpetual futures on HyperEVM, up to 1000x leverage) market data, charts, protocol stats, liquidation maps, leaderboards, top trades, recent trades, wallet accounts, trade history, equity curves, position math and deposit instructions. Read-only. Trading requires the MCP server with OAuth at ' + MCP_URL + '.',
        auth: { type: 'none' },
        api: { type: 'openapi', url: `${SITE}/openapi.json` },
        logo_url: `${SITE}/icon-512.png`,
        contact_email: 'nirholas@users.noreply.github.com',
        legal_info_url: `${SITE}/privacy`,
      },
      null,
      2,
    ),
  );
  await write('.well-known/security.txt', `Contact: ${REPO}/security/advisories/new\nExpires: ${new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 19)}Z\nPreferred-Languages: en\nCanonical: ${SITE}/.well-known/security.txt\nPolicy: ${REPO}/blob/main/SECURITY.md\n`);

  const urls = ['/', ...ordered.map(docPath), '/privacy'];
  await write(
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod><changefreq>${u === '/' ? 'daily' : 'weekly'}</changefreq><priority>${u === '/' ? '1.0' : u === '/privacy' ? '0.3' : '0.8'}</priority></url>`).join('\n')}\n</urlset>\n`,
  );
  await write(`${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
  await write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /authorize\nDisallow: /account/api\nDisallow: /token\nDisallow: /register\n\nSitemap: ${SITE}/sitemap.xml\n`);
  await write(
    'site.webmanifest',
    JSON.stringify({ name: NAME, short_name: 'Papertrade AI', description: SHORT, start_url: '/', display: 'standalone', background_color: '#07090c', theme_color: '#07090c', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2),
  );

  // llms.txt: the map; llms-full.txt: every doc inline, frontmatter stripped.
  const docLine = (s) => `- [${pages.get(s).meta.title}](${SITE}/docs/${s === 'getting-started' ? 'getting-started' : s}.md): ${pages.get(s).meta.description}`;
  const llms = `# ${NAME}

> ${DESCRIPTION}

- Remote MCP server (Streamable HTTP, OAuth 2.1): ${MCP_URL}
- Public MCP endpoint, no auth, read-only tools: ${PUBLIC_MCP_URL}
- Local stdio server: \`npx -y papertrade-ai\`
- REST API: ${SITE}/api/v1/tools/{name}, OpenAPI at ${SITE}/openapi.json
- MCP Registry name: ${REGISTRY_NAME}
- Source: ${REPO} (MIT)

Papertrade is a perpetual futures exchange on HyperEVM (chain 999) for BTC and ETH with up to 1000x leverage, $10 minimum margin and $10,000 minimum position size. Positions use real USDC. Trading through ${NAME} needs a session key the wallet owner approves with guardrails; the key cannot withdraw funds. Opening a position is always preview_trade, then open_position with the returned quoteId.

## Docs

${ordered.map(docLine).join('\n')}

## Tools

${TOOLS.map((t) => `- \`${t.name}\` (${t.access === 'trade' ? 'trading session' : 'public'}): ${t.description}`).join('\n')}

## Optional

- [Privacy policy](${SITE}/privacy.md)
- [Full documentation in one file](${SITE}/llms-full.txt)
`;
  await write('llms.txt', llms);
  await write(
    'llms-full.txt',
    `# ${NAME}: full documentation\n\n> ${DESCRIPTION}\n\n${ordered.map((s) => pages.get(s).body.trim()).join('\n\n---\n\n')}\n`,
  );
}

// ------------------------------------------------------------------ distribution manifests (repo root)

async function buildManifests() {
  await writeRoot('server.json', JSON.stringify(registryServerJson(), null, 2) + '\n');
  await writeRoot(
    'gemini-extension.json',
    JSON.stringify({ name: 'papertrade-ai', version: VERSION, description: SHORT, contextFileName: 'GEMINI.md', mcpServers: { papertrade: { httpUrl: MCP_URL } } }, null, 2) + '\n',
  );
  await writeRoot('.mcp.json', JSON.stringify({ mcpServers: { papertrade: { type: 'http', url: MCP_URL } } }, null, 2) + '\n');
  await writeRoot(
    '.claude-plugin/plugin.json',
    JSON.stringify(
      {
        name: 'papertrade-ai',
        version: VERSION,
        description: `${SHORT} Includes the remote MCP server, a trading skill and slash commands.`,
        author: { name: 'nirholas', url: 'https://github.com/nirholas' },
        homepage: `${SITE}/`,
        repository: REPO,
        license: 'MIT',
        keywords: ['papertrade', 'trading', 'perps', 'crypto', 'hyperevm', 'mcp'],
      },
      null,
      2,
    ) + '\n',
  );
  await writeRoot(
    '.claude-plugin/marketplace.json',
    JSON.stringify(
      {
        name: 'papertrade-ai',
        owner: { name: 'nirholas', url: 'https://github.com/nirholas' },
        metadata: { description: `${NAME} plugins for Claude Code.`, version: VERSION },
        plugins: [{ name: 'papertrade-ai', source: './', description: SHORT, version: VERSION, category: 'finance', keywords: ['papertrade', 'trading', 'perps', 'mcp'], homepage: `${SITE}/` }],
      },
      null,
      2,
    ) + '\n',
  );
  await writeRoot('glama.json', JSON.stringify({ $schema: 'https://glama.ai/mcp/schemas/server.json', maintainers: ['nirholas'] }, null, 2) + '\n');
}

// ------------------------------------------------------------------ main

// Empty public/ in place rather than deleting it, so a running `wrangler dev` keeps serving it.
await mkdir(out, { recursive: true });
for (const entry of await readdir(out)) await rm(join(out, entry), { recursive: true, force: true });
const { pages, ordered } = await buildDocs();
await write('index.html', landing());
await buildImages();
await buildDiscovery(pages, ordered);
await buildManifests();
await copyFile(join(root, 'site/site.css'), join(out, 'site.css'));
await copyFile(join(root, 'site/site.js'), join(out, 'site.js'));
await mkdir(join(out, 'fonts'), { recursive: true });
await copyFile(join(root, 'site/fonts/InterVariable.woff2'), join(out, 'fonts/InterVariable.woff2'));
for (const f of ['site/site.css', 'site/site.js']) assertTypography(await readFile(join(root, f), 'utf8'), f);
console.log(`site: ${pages.size} docs pages, ${TOOLS.length} tools, ${SITE}`);
