/**
 * papertrade-ai: local MCP server (stdio) for Claude Desktop, Claude Code, Codex, Cursor, VS Code,
 * Gemini CLI, Windsurf and any other MCP client, plus a wallet login that never leaves this machine.
 *
 *   papertrade-ai                 serve MCP over stdio
 *   papertrade-ai login           connect a wallet in the browser (read-only or trading with guardrails)
 *   papertrade-ai login --key     headless: register a session key with PAPERTRADE_PRIVATE_KEY
 *   papertrade-ai status          show the connected wallet, session and guardrails
 *   papertrade-ai logout          delete the local credentials
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import type { Address, Hex } from 'viem';
import { SERVER_NAME, SERVER_VERSION, UserFacingError } from './core/constants.js';
import { registrationTypedData, submitRegistration, verifyRegistration, type SessionCredential } from './core/intents.js';
import { splitSignature, typedDataFor } from './core/typed-data.js';
import { isAddress } from './core/units.js';
import { beginConnect, finishConnect, HYPEREVM_WALLET_CHAIN, SESSION_DAYS, type PendingConnect } from './connect.js';
import { DEFAULT_POLICY, policyFromEnv, PolicySchema, type Policy } from './policy.js';
import { createServer } from './server.js';
import type { Principal, ToolContext } from './tools/registry.js';
import { connectPage, messagePage } from './web/page.js';
import { CONNECT_JS } from './generated/assets.js';

interface Credentials {
  version: 1;
  mode: 'read' | 'trade';
  wallet: Address;
  session?: SessionCredential;
  policy?: Policy;
  createdAt: number;
}

const CONFIG_DIR = process.env.PAPERTRADE_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'papertrade-ai');
const CREDENTIALS = join(CONFIG_DIR, 'credentials.json');
const log = (...a: unknown[]) => console.error(...a);

async function loadCredentials(): Promise<Credentials | undefined> {
  try {
    const c = JSON.parse(await readFile(CREDENTIALS, 'utf8')) as Credentials;
    return c?.version === 1 && isAddress(c.wallet) ? c : undefined;
  } catch {
    return undefined;
  }
}

async function saveCredentials(c: Credentials) {
  await mkdir(dirname(CREDENTIALS), { recursive: true, mode: 0o700 });
  await writeFile(CREDENTIALS, JSON.stringify(c, null, 2), { mode: 0o600 });
  await chmod(CREDENTIALS, 0o600);
}

const sessionLive = (s?: SessionCredential) => Boolean(s && s.expiry * 1000 > Date.now() + 60_000);

/** Register a session key signed directly by the wallet's own key (headless agents, CI, servers). */
async function registerWithPrivateKey(privateKey: Hex, policy: Policy): Promise<Credentials> {
  const owner = privateKeyToAccount(privateKey);
  const wallet = owner.address.toLowerCase() as Address;
  const sessionKey = generatePrivateKey();
  const sessionAddress = privateKeyToAccount(sessionKey).address.toLowerCase() as Address;
  const { wire } = registrationTypedData(wallet, sessionAddress);
  const signature = await owner.signTypedData(typedDataFor('RegisterSessionKey', wire) as Parameters<typeof owner.signTypedData>[0]);
  const signed = { ...wire, ...splitSignature(signature) };
  const verified = await verifyRegistration(signed, sessionAddress);
  await submitRegistration(signed);
  return { version: 1, mode: 'trade', wallet, session: { wallet, sessionKey, sessionAddress, expiry: verified.expiry }, policy, createdAt: Date.now() };
}

/** Who the MCP server acts for: saved login, then a private key in the environment, then a read-only wallet address. */
async function resolvePrincipal(): Promise<Principal> {
  const envKey = process.env.PAPERTRADE_PRIVATE_KEY?.trim();
  const saved = await loadCredentials();
  if (envKey) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(envKey)) throw new Error('PAPERTRADE_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key.');
    const wallet = privateKeyToAccount(envKey as Hex).address.toLowerCase() as Address;
    const policy = policyFromEnv(process.env);
    if (saved?.wallet === wallet && saved.mode === 'trade' && sessionLive(saved.session)) return { wallet, session: saved.session, policy };
    log(`papertrade-ai: registering a ${SESSION_DAYS}-day session key for ${wallet} (cannot withdraw funds)...`);
    const creds = await registerWithPrivateKey(envKey as Hex, policy);
    await saveCredentials(creds);
    return { wallet, session: creds.session, policy };
  }
  if (saved) {
    if (saved.mode === 'trade' && saved.policy && sessionLive(saved.session)) return { wallet: saved.wallet, session: saved.session, policy: saved.policy };
    if (saved.mode === 'trade') log('papertrade-ai: your trading session expired; serving read-only. Run `npx papertrade-ai login` to trade again.');
    return { wallet: saved.wallet };
  }
  const envWallet = process.env.PAPERTRADE_WALLET?.trim();
  if (envWallet) {
    if (!isAddress(envWallet)) throw new Error('PAPERTRADE_WALLET is not a valid 0x address.');
    return { wallet: envWallet.toLowerCase() as Address };
  }
  return {};
}

async function serve() {
  const principal = await resolvePrincipal();
  const ctx: ToolContext = {
    principal,
    quoteSecret: randomBytes(32).toString('hex'),
    connectHint: 'run `npx -y papertrade-ai login` in a terminal, then restart this MCP server',
  };
  serveStdio(() => createServer(ctx), { onerror: (e) => log('papertrade-ai:', e.message) });
  log(`papertrade-ai ${SERVER_VERSION} on stdio${principal.wallet ? ` for ${principal.wallet}${principal.session ? ' (trading enabled)' : ' (read-only)'}` : ' (market data only; run `papertrade-ai login` to connect a wallet)'}`);
}

// ---------- browser login on 127.0.0.1 ----------

function openBrowser(url: string) {
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform() === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
  } catch {
    // The URL is printed as well; opening it by hand is the fallback.
  }
}

function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new UserFacingError('Request too large.', 'invalid_request'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch {
        reject(new UserFacingError('Expected a JSON object.', 'invalid_request'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  res.end(body);
}

async function browserLogin(): Promise<Credentials> {
  const handle = randomBytes(24).toString('base64url');
  let pending: PendingConnect | undefined;
  return new Promise((resolve, reject) => {
    const server = createHttpServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const origin = `http://${req.headers.host}`;
      try {
        if (req.headers.host !== `127.0.0.1:${(server.address() as { port: number }).port}`) return send(res, 421, 'text/plain', 'Wrong host');
        if (req.method === 'GET' && url.pathname === '/') {
          if (url.searchParams.get('h') !== handle) return send(res, 403, 'text/html; charset=utf-8', messagePage('Link expired', 'Open the link printed in your terminal.', 'error'));
          return send(
            res,
            200,
            'text/html; charset=utf-8',
            connectPage({ clientName: 'papertrade-ai on this computer', redirectHost: 'your terminal', endpoint: '/connect', handle, allowTrade: true, defaultPolicy: DEFAULT_POLICY, sessionDays: SESSION_DAYS, chain: HYPEREVM_WALLET_CHAIN, canDeny: true, script: CONNECT_JS }),
          );
        }
        if (req.method === 'GET' && url.pathname === '/done')
          return send(res, 200, 'text/html; charset=utf-8', url.searchParams.has('cancelled') ? messagePage('Cancelled', 'Nothing was connected. You can close this tab.', 'error') : messagePage('Connected', 'Your wallet is connected. Close this tab and restart your MCP client.'));
        if (req.method === 'POST' && url.pathname === '/connect') {
          if (req.headers.origin !== origin) return send(res, 403, 'application/json', JSON.stringify({ ok: false, error: { code: 'forbidden', message: 'Cross-site request blocked.' } }));
          const body = await readBody(req);
          if (body.handle !== handle) throw new UserFacingError('This page is stale. Open the link from your terminal again.', 'invalid_request');
          if (body.step === 'deny') {
            send(res, 200, 'application/json', JSON.stringify({ redirectTo: '/done?cancelled=1' }));
            server.close();
            return reject(new UserFacingError('Login cancelled in the browser.', 'cancelled'));
          }
          if (body.step === 'begin') {
            const begun = beginConnect({ mode: body.mode, wallet: body.wallet, appName: 'papertrade-ai CLI', host: 'localhost' });
            pending = begun.pending;
            return send(res, 200, 'application/json', JSON.stringify({ sign: begun.sign, pending: 'local' }));
          }
          if (body.step === 'finish') {
            if (!pending) throw new UserFacingError('Start again from the beginning.', 'invalid_request');
            const grant = await finishConnect(pending, { signature: body.signature, policy: body.policy });
            pending = undefined;
            const creds: Credentials = { version: 1, mode: grant.mode, wallet: grant.wallet, session: grant.session, policy: grant.policy, createdAt: Date.now() };
            await saveCredentials(creds);
            send(res, 200, 'application/json', JSON.stringify({ redirectTo: '/done', message: 'Connected. You can close this tab.' }));
            server.close();
            return resolve(creds);
          }
          throw new UserFacingError('Unknown step.', 'invalid_request');
        }
        send(res, 404, 'text/plain', 'Not found');
      } catch (e) {
        const err = e instanceof UserFacingError ? e : new UserFacingError('Something went wrong. Check the terminal and try again.', 'internal_error');
        if (!(e instanceof UserFacingError)) log(e);
        send(res, 400, 'application/json', JSON.stringify({ ok: false, error: { code: err.code, message: err.message } }));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      const link = `http://127.0.0.1:${port}/?h=${handle}`;
      log(`\nOpen this link to connect your wallet (it stays on this computer):\n\n  ${link}\n`);
      openBrowser(link);
    });
    setTimeout(() => {
      server.close();
      reject(new UserFacingError('Login timed out after 15 minutes.', 'expired'));
    }, 15 * 60 * 1000).unref();
  });
}

function describe(c: Credentials) {
  const lines = [`Wallet:   ${c.wallet}`, `Access:   ${c.mode === 'trade' ? 'trading with guardrails' : 'read-only'}`];
  if (c.session) lines.push(`Session:  ${c.session.sessionAddress} (${sessionLive(c.session) ? `valid until ${new Date(c.session.expiry * 1000).toLocaleString()}` : 'expired'})`);
  if (c.policy)
    lines.push(
      `Limits:   $${c.policy.maxMarginPerTradeUsd} margin and ${c.policy.maxLeverage}x per trade, $${c.policy.maxDailyNotionalUsd} size per 24h, ${c.policy.maxOpenPositions} open, ${c.policy.allowedMarkets.join('/')}`,
      `Confirm:  ${c.policy.requireConfirmation ? 'preview required before every trade' : 'trades execute directly'}`,
    );
  lines.push(`File:     ${CREDENTIALS}`);
  return lines.join('\n');
}

const HELP = `papertrade-ai ${SERVER_VERSION}: trade Papertrade perps from any AI assistant

Usage:
  papertrade-ai                 Run the MCP server on stdio (what MCP clients launch)
  papertrade-ai login           Connect a wallet in your browser (read-only or trading)
  papertrade-ai login --key     Headless: register a session key using PAPERTRADE_PRIVATE_KEY
  papertrade-ai status          Show the connected wallet, session and guardrails
  papertrade-ai logout          Delete the saved credentials
  papertrade-ai --version

Environment:
  PAPERTRADE_WALLET             Read-only wallet address (no login needed)
  PAPERTRADE_PRIVATE_KEY        Wallet key for headless trading; only used to sign a session key
  PAPERTRADE_MAX_MARGIN_USD, PAPERTRADE_MAX_LEVERAGE, PAPERTRADE_MAX_DAILY_NOTIONAL_USD,
  PAPERTRADE_MAX_OPEN_POSITIONS, PAPERTRADE_MARKETS, PAPERTRADE_REQUIRE_CONFIRMATION
                                Guardrails for headless trading
  PAPERTRADE_CONFIG_DIR         Where credentials are stored (default ~/.config/papertrade-ai)

Docs: https://github.com/nirholas/papertrade-ai`;

async function main(argv: string[]) {
  const [cmd, ...rest] = argv;
  if (cmd === '--version' || cmd === '-v') return console.log(SERVER_VERSION);
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') return console.log(HELP);
  if (!cmd || cmd === 'serve' || cmd === 'stdio') return serve();
  if (cmd === 'login') {
    let creds: Credentials;
    if (rest.includes('--key')) {
      const key = process.env.PAPERTRADE_PRIVATE_KEY?.trim();
      if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('Set PAPERTRADE_PRIVATE_KEY to the wallet key (0x + 64 hex) first.');
      creds = await registerWithPrivateKey(key as Hex, PolicySchema.parse(policyFromEnv(process.env)));
      await saveCredentials(creds);
    } else creds = await browserLogin();
    console.log(`\nConnected.\n${describe(creds)}\n\nRestart your MCP client so it picks up the new access.`);
    return;
  }
  if (cmd === 'status') {
    const c = await loadCredentials();
    console.log(c ? describe(c) : `Not connected. Run \`npx papertrade-ai login\`, or set PAPERTRADE_WALLET for read-only access.`);
    return;
  }
  if (cmd === 'logout') {
    await rm(CREDENTIALS, { force: true });
    console.log(`Removed ${CREDENTIALS}. Any session key registered on Papertrade expires on its own and cannot withdraw funds.`);
    return;
  }
  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  process.exitCode = 2;
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`${SERVER_NAME}: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
