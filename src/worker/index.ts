import OAuthProvider, { type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { recoverMessageAddress, type Address, type Hex } from 'viem';
import { UserFacingError } from '../core/constants.js';
import { isAddress } from '../core/units.js';
import { beginConnect, finishConnect, HYPEREVM_WALLET_CHAIN, PENDING_TTL_SECONDS, SESSION_DAYS, type PendingConnect } from '../connect.js';
import { DEFAULT_POLICY, type Policy } from '../policy.js';
import { openApiDocument } from '../openapi.js';
import { createServer } from '../server.js';
import { findTool, runTool, TOOLS, type Principal, type ToolContext } from '../tools/registry.js';
import type { SessionCredential } from '../core/intents.js';
import { seal, unseal } from '../seal.js';
import { connectPage, layout, messagePage } from '../web/page.js';
import { ACCOUNT_JS, CONNECT_JS } from '../generated/assets.js';

export interface Env {
  OAUTH_KV: KVNamespace;
  ASSETS: Fetcher;
  OAUTH_PROVIDER: OAuthHelpers;
  /** Secret for quote HMACs and sealed browser state. `wrangler secret put SERVER_SECRET`. */
  SERVER_SECRET: string;
  PUBLIC_URL: string;
}

/** What a grant carries into every authenticated request (encrypted at rest by the provider). */
interface GrantProps {
  mode: 'read' | 'trade';
  wallet: Address;
  clientName: string;
  session?: SessionCredential;
  policy?: Policy;
}

interface GrantMetadata {
  clientName: string;
  mode: 'read' | 'trade';
  createdAt: number;
  sessionAddress?: string;
  sessionExpiresAt?: number;
  policy?: Policy;
}

const SCOPES = { read: ['trade:read', 'offline_access'], trade: ['trade:read', 'trade:write', 'offline_access'] };

function json(body: unknown, init: ResponseInit & { headers?: HeadersInit } = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(body), { ...init, headers });
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version' };

/** REST and discovery responses are readable from any origin; auth is bearer-only, never cookies. */
function withCors(res: Response) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

const SITE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://cursor.com https://img.shields.io; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";

/** Machine-readable files agents and crawlers fetch cross-origin. */
const AGENT_FILE = /^\/(\.well-known\/|llms(-full)?\.txt$|robots\.txt$|sitemap\.xml$|site\.webmanifest$|.*\.md$)/;

/** Static site responses: security headers on every file, CORS on agent files, caching by type. */
function siteResponse(res: Response, pathname: string) {
  const h = new Headers(res.headers);
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  const type = h.get('content-type') ?? '';
  if (type.includes('text/html')) {
    h.set('content-security-policy', SITE_CSP);
    h.set('x-frame-options', 'DENY');
    h.set('cache-control', 'public, max-age=300, must-revalidate');
  } else if (/\.(woff2|png|svg)$/.test(pathname)) h.set('cache-control', 'public, max-age=604800');
  else if (/\.(css|js)$/.test(pathname)) h.set('cache-control', 'public, max-age=86400');
  else h.set('cache-control', 'public, max-age=3600');
  if (AGENT_FILE.test(pathname)) for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  if (pathname.endsWith('.md')) h.set('content-type', 'text/markdown; charset=utf-8');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

function errorJson(err: unknown, status = 400) {
  const e = err instanceof UserFacingError ? err : null;
  if (!e) console.error(err);
  return json({ ok: false, error: { code: e?.code ?? 'internal_error', message: e?.message ?? 'Something went wrong on our side. Try again.' } }, { status: e ? (e.code.startsWith('upstream') || e.code === 'rate_limited' ? 502 : status) : 500 });
}

function html(body: string, headers?: Headers, status = 200) {
  const h = new Headers(headers);
  h.set('content-type', 'text/html; charset=utf-8');
  h.set('cache-control', 'no-store');
  h.set('x-frame-options', 'DENY');
  h.set('content-security-policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  return new Response(body, { status, headers: h });
}

/** Same-origin check for every state-changing browser POST. */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new UserFacingError('Cross-site request blocked.', 'forbidden');
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new UserFacingError('Expected a JSON body.', 'invalid_request');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserFacingError('Expected a JSON object.', 'invalid_request');
  return body as Record<string, unknown>;
}

function toolContext(env: Env, principal: Principal): ToolContext {
  return { principal, quoteSecret: env.SERVER_SECRET, connectHint: `reconnect this app (remove it and add it again) and choose "Trade with guardrails". Manage connected apps at ${env.PUBLIC_URL}/account` };
}

function principalFromProps(props: GrantProps | undefined): Principal {
  if (!props?.wallet) return {};
  return props.mode === 'trade' && props.session && props.policy ? { wallet: props.wallet, session: props.session, policy: props.policy } : { wallet: props.wallet };
}

// ---------- MCP ----------

const mcp = createMcpHandler(
  (ctx) => {
    const extra = ctx.authInfo?.extra as { env: Env; principal: Principal } | undefined;
    if (!extra) throw new Error('missing request context');
    return createServer(toolContext(extra.env, extra.principal));
  },
  { legacy: 'stateless', onerror: (e) => console.error('mcp', e) },
);

function serveMcp(request: Request, env: Env, principal: Principal, token = 'public', scopes: string[] = []) {
  return mcp.fetch(request, { authInfo: { token, clientId: 'papertrade-ai', scopes, extra: { env, principal } } });
}

/** Authenticated surface (/mcp and /api/v1/me/*): the provider has already validated the bearer token. */
const apiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props?: GrantProps }) {
    const url = new URL(request.url);
    const principal = principalFromProps(ctx.props);
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) return serveMcp(request, env, principal, 'oauth', ctx.props?.mode === 'trade' ? SCOPES.trade : SCOPES.read);
    const m = /^\/api\/v1\/me\/tools\/([a-z_]+)$/.exec(url.pathname);
    if (m && request.method === 'POST') return withCors(await restTool(request, env, m[1], principal, true));
    if (url.pathname === '/api/v1/me' && request.method === 'GET')
      return withCors(json({ ok: true, wallet: principal.wallet ?? null, mode: ctx.props?.mode ?? null, canTrade: Boolean(principal.session), policy: principal.policy ?? null }));
    return withCors(json({ ok: false, error: { code: 'not_found', message: 'Not found.' } }, { status: 404 }));
  },
};

async function restTool(request: Request, env: Env, name: string, principal: Principal, authenticated: boolean) {
  const def = findTool(name);
  if (!def) return json({ ok: false, error: { code: 'not_found', message: `Unknown tool "${name}". See /openapi.json.` } }, { status: 404 });
  if (!authenticated && def.access !== 'public') return json({ ok: false, error: { code: 'unauthorized', message: 'This tool needs an OAuth token. Use /api/v1/me/tools/' + name } }, { status: 401 });
  try {
    const raw = request.headers.get('content-length') === '0' ? {} : await request.json().catch(() => ({}));
    const res = await runTool(name, raw, toolContext(env, principal));
    return json({ ok: true, summary: res.summary, data: res.data });
  } catch (e) {
    return errorJson(e);
  }
}

// ---------- consent (/authorize) ----------

interface ConsentCtx {
  handle: string;
  clientName: string;
}

async function authorizeGet(request: Request, env: Env) {
  let authReq: AuthRequest;
  try {
    authReq = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (e) {
    return html(messagePage('Invalid request', `This authorization link is not valid: ${(e as Error).message}`, 'error'), undefined, 400);
  }
  const consent = await env.OAUTH_PROVIDER.describeConsent(authReq);
  const { handle, headers } = await env.OAUTH_PROVIDER.beginConsent(authReq);
  const clientName = consent.clientDomain ? `${consent.clientName} (${consent.clientDomain})` : consent.clientName;
  const sealed = await seal(env.SERVER_SECRET, 'consent', { handle, clientName } satisfies ConsentCtx, PENDING_TTL_SECONDS);
  const page = connectPage({
    clientName,
    redirectHost: consent.redirectIsLoopback ? `${consent.redirectHost} (an app on this computer)` : consent.redirectHost,
    endpoint: '/authorize',
    handle: sealed,
    allowTrade: true,
    defaultPolicy: DEFAULT_POLICY,
    sessionDays: SESSION_DAYS,
    chain: HYPEREVM_WALLET_CHAIN,
    canDeny: true,
    script: CONNECT_JS,
  });
  return html(page, headers);
}

async function authorizePost(request: Request, env: Env) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const consent = await unseal<ConsentCtx>(env.SERVER_SECRET, 'consent', body.handle);
    const host = new URL(env.PUBLIC_URL).host;

    if (body.step === 'deny') {
      const denied = await env.OAUTH_PROVIDER.denyConsent(request, consent.handle);
      return json({ redirectTo: denied.redirectTo }, { headers: denied.headers });
    }

    if (body.step === 'begin') {
      const { pending, sign } = beginConnect({ mode: body.mode, wallet: body.wallet, appName: consent.clientName, host });
      return json({ sign, pending: await seal(env.SERVER_SECRET, 'pending', pending, PENDING_TTL_SECONDS, consent.handle) });
    }

    if (body.step === 'finish') {
      const pending = await unseal<PendingConnect>(env.SERVER_SECRET, 'pending', body.pending, consent.handle);
      const grant = await finishConnect(pending, { signature: body.signature, policy: body.policy });
      const scope = SCOPES[grant.mode];
      const approved = await env.OAUTH_PROVIDER.approveConsent(request, consent.handle, { scope });
      const props: GrantProps = { mode: grant.mode, wallet: grant.wallet, clientName: consent.clientName, session: grant.session, policy: grant.policy };
      const metadata: GrantMetadata = {
        clientName: consent.clientName,
        mode: grant.mode,
        createdAt: Date.now(),
        sessionAddress: grant.session?.sessionAddress,
        sessionExpiresAt: grant.session?.expiry,
        policy: grant.policy,
      };
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({ request: approved.request, userId: grant.wallet, metadata, scope, props, revokeExistingGrants: true });
      const message =
        grant.mode === 'trade'
          ? grant.sessionConfirmed
            ? 'Trading session registered. Returning to your app...'
            : 'Registration submitted to Papertrade; it settles in a few seconds. Returning to your app...'
          : 'Connected read-only. Returning to your app...';
      return json({ redirectTo, message }, { headers: approved.headers });
    }
    throw new UserFacingError('Unknown step.', 'invalid_request');
  } catch (e) {
    return errorJson(e);
  }
}

// ---------- account management (/account) ----------

const ACCOUNT_TTL = 10 * 60;

function accountPage() {
  return layout({
    title: 'Manage Papertrade AI access',
    body: `<section class="card" aria-labelledby="t">
  <h1 id="t">Connected AI apps</h1>
  <p class="muted small">Sign in with the wallet you connected to see every AI app that can read or trade your Papertrade account, their guardrails, and revoke any of them. Revoking deletes that app's tokens and its session key from this server.</p>
  <div class="wallets" id="wallets"></div>
  <div id="signed-in" hidden><p class="small muted" id="who"></p><div id="grants" class="wallets"></div></div>
  <p class="status" id="status" role="status" aria-live="polite"></p>
</section>
<section class="card"><h2>Change guardrails</h2><p class="small muted">Limits are fixed per connection. To change them, revoke the app here and connect it again with new limits.</p></section>`,
    script: ACCOUNT_JS,
  });
}

async function accountApi(request: Request, env: Env) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    if (body.step === 'challenge') {
      if (typeof body.wallet !== 'string' || !isAddress(body.wallet)) throw new UserFacingError('Connect a wallet first.', 'invalid_request');
      const wallet = body.wallet.toLowerCase();
      const nonce = crypto.randomUUID();
      const message = `Sign in to manage Papertrade AI access.\n\nWallet: ${wallet}\nSite: ${new URL(env.PUBLIC_URL).host}\nNonce: ${nonce}\nIssued: ${new Date().toISOString()}\n\nThis signature costs nothing and cannot move funds.`;
      return json({ message, challenge: await seal(env.SERVER_SECRET, 'account-challenge', { wallet, message }, ACCOUNT_TTL) });
    }
    if (body.step === 'list') {
      const ch = await unseal<{ wallet: string; message: string }>(env.SERVER_SECRET, 'account-challenge', body.challenge);
      if (typeof body.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) throw new UserFacingError('The wallet did not return a valid signature.', 'invalid_signature');
      const signer = await recoverMessageAddress({ message: ch.message, signature: body.signature as Hex });
      if (signer.toLowerCase() !== ch.wallet) throw new UserFacingError('The signature is from a different wallet.', 'invalid_signature');
      return json({ token: await seal(env.SERVER_SECRET, 'account', { wallet: ch.wallet }, ACCOUNT_TTL), grants: await listGrants(env, ch.wallet) });
    }
    if (body.step === 'revoke') {
      const { wallet } = await unseal<{ wallet: string }>(env.SERVER_SECRET, 'account', body.token);
      if (typeof body.grantId !== 'string' || !body.grantId) throw new UserFacingError('Missing grant.', 'invalid_request');
      await env.OAUTH_PROVIDER.revokeGrant(body.grantId, wallet);
      return json({ ok: true });
    }
    throw new UserFacingError('Unknown step.', 'invalid_request');
  } catch (e) {
    return errorJson(e);
  }
}

async function listGrants(env: Env, wallet: string) {
  const out: (GrantMetadata & { id: string; scope: string[] })[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.OAUTH_PROVIDER.listUserGrants(wallet, { cursor });
    for (const g of page.items) out.push({ id: g.id, scope: g.scope, ...(g.metadata as GrantMetadata) });
    cursor = page.cursor;
  } while (cursor);
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- everything else ----------

const defaultHandler = {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === 'OPTIONS' && (pathname.startsWith('/api/') || pathname === '/public/mcp' || pathname === '/openapi.json' || AGENT_FILE.test(pathname)))
      return new Response(null, {
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version', 'access-control-max-age': '86400' },
      });
    if (pathname === '/authorize') return request.method === 'POST' ? authorizePost(request, env) : authorizeGet(request, env);
    if (pathname === '/account') return html(accountPage());
    if (pathname === '/account/api' && request.method === 'POST') return accountApi(request, env);
    if (pathname === '/public/mcp') {
      const res = await serveMcp(request, env, {});
      return withCors(res);
    }
    if (pathname === '/openapi.json' || pathname === '/.well-known/openapi.json')
      return withCors(json(openApiDocument(env.PUBLIC_URL), { headers: { 'cache-control': 'public, max-age=300' } }));
    if (pathname.startsWith('/api/')) return withCors(await restApi(request, env, url));
    if (pathname === '/healthz') return json({ ok: true, tools: TOOLS.length });
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return siteResponse(asset, pathname);
    return html(messagePage('Not found', `Nothing lives at ${pathname}. Head to the home page for setup instructions.`, 'error'), undefined, 404);
  },
};

/** Public REST surface: /api/v1/tools and /api/v1/tools/{name}. */
async function restApi(request: Request, env: Env, url: URL) {
  if (url.pathname === '/api/v1/tools' && request.method === 'GET')
    return json({ ok: true, tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, access: t.access, annotations: t.annotations })) }, { headers: { 'cache-control': 'public, max-age=300' } });
  const m = /^\/api\/v1\/tools\/([a-z_]+)$/.exec(url.pathname);
  if (!m) return json({ ok: false, error: { code: 'not_found', message: `Nothing at ${url.pathname}. See ${env.PUBLIC_URL}/openapi.json.` } }, { status: 404 });
  if (request.method === 'GET') {
    const args = Object.fromEntries([...url.searchParams].map(([k, v]) => [k, /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v]));
    return restToolArgs(env, m[1], args);
  }
  if (request.method === 'POST') return restTool(request, env, m[1], {}, false);
  return json({ ok: false, error: { code: 'method_not_allowed', message: 'Use GET with query parameters or POST with a JSON body.' } }, { status: 405, headers: { allow: 'GET, POST, OPTIONS' } });
}

async function restToolArgs(env: Env, name: string, args: Record<string, unknown>) {
  const def = findTool(name);
  if (!def) return json({ ok: false, error: { code: 'not_found', message: `Unknown tool "${name}".` } }, { status: 404 });
  if (def.access !== 'public') return json({ ok: false, error: { code: 'unauthorized', message: 'This tool needs an OAuth token.' } }, { status: 401 });
  try {
    const res = await runTool(name, args, toolContext(env, {}));
    return json({ ok: true, summary: res.summary, data: res.data }, { headers: { 'cache-control': 'public, max-age=5' } });
  } catch (e) {
    return errorJson(e);
  }
}

/** The provider needs its canonical resource URL up front, which comes from the environment, so it is built on first request. */
let provider: { url: string; instance: OAuthProvider<Env> } | undefined;

function oauthProvider(env: Env) {
  const url = env.PUBLIC_URL.replace(/\/+$/, '');
  if (provider?.url !== url)
    provider = {
      url,
      instance: new OAuthProvider<Env>({
        apiRoute: ['/mcp', '/api/v1/me'],
        apiHandler: apiHandler as never,
        defaultHandler: defaultHandler as never,
        authorizeEndpoint: '/authorize',
        tokenEndpoint: '/token',
        clientRegistrationEndpoint: '/register',
        scopesSupported: ['trade:read', 'trade:write', 'offline_access'],
        accessTokenTTL: 3600,
        refreshTokenTTL: 30 * 24 * 3600,
        clientIdMetadataDocumentEnabled: true,
        cookiePrefix: '__Host-pt-',
        resourceMetadata: {
          // The whole origin is the resource: one token serves /mcp and the REST mirror at /api/v1/me.
          resource: url,
          resource_name: 'Papertrade AI',
        },
      }),
    };
  return provider.instance;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return oauthProvider(env).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
