#!/usr/bin/env node
/**
 * Builds papertrade-ai.mcpb, the one-click Claude Desktop bundle: the CLI bundled with every
 * dependency into a single file, plus a manifest whose settings map to the CLI's environment
 * variables. Output: build/papertrade-ai.mcpb. Run after `npm run build` and `npm run site`.
 */
import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const stage = join(root, 'build/mcpb');
const SITE = 'https://papertrade-ai.ninabrekkerese.workers.dev';

await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, 'server'), { recursive: true });

await build({
  entryPoints: [join(root, 'src/cli.ts')],
  outfile: join(stage, 'server/cli.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node20'],
  legalComments: 'none',
  minify: true,
  // Bundled CommonJS dependencies still call require(); give the ESM output one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
await copyFile(join(root, 'build/icon.png'), join(stage, 'icon.png'));
await copyFile(join(root, 'LICENSE'), join(stage, 'LICENSE'));

const manifest = {
  manifest_version: '0.3',
  name: 'papertrade-ai',
  display_name: 'Papertrade AI',
  version: pkg.version,
  description: 'Trade Papertrade BTC and ETH perps from Claude with live markets, analytics and guarded trading.',
  long_description:
    'Live Papertrade markets, charts, liquidation maps, leaderboards and wallet analytics, plus guarded trading through a non-custodial session key that cannot withdraw. Run `npx -y papertrade-ai login` once in a terminal to connect a wallet in your browser, or set a wallet address below for read-only access. Market tools work with no setup.',
  author: { name: 'nirholas', url: 'https://github.com/nirholas' },
  repository: { type: 'git', url: 'https://github.com/nirholas/papertrade-ai' },
  homepage: `${SITE}/`,
  documentation: `${SITE}/docs/`,
  support: 'https://github.com/nirholas/papertrade-ai/issues',
  icon: 'icon.png',
  license: 'MIT',
  keywords: ['papertrade', 'trading', 'perps', 'crypto', 'bitcoin', 'ethereum', 'hyperevm'],
  privacy_policies: [`${SITE}/privacy`],
  server: {
    type: 'node',
    entry_point: 'server/cli.mjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/cli.mjs'],
      env: {
        PAPERTRADE_WALLET: '${user_config.wallet}',
        PAPERTRADE_PRIVATE_KEY: '${user_config.private_key}',
        PAPERTRADE_MAX_MARGIN_USD: '${user_config.max_margin_usd}',
        PAPERTRADE_MAX_LEVERAGE: '${user_config.max_leverage}',
      },
    },
  },
  tools_generated: true,
  user_config: {
    wallet: { type: 'string', title: 'Wallet address (read-only)', description: 'Optional. Lets Claude read this wallet\'s Papertrade account without logging in. Ignored after `npx -y papertrade-ai login`.', required: false, default: '' },
    private_key: { type: 'string', title: 'Wallet private key (headless trading)', description: 'Optional and not recommended for main wallets. Used once to register a 30-day session key that cannot withdraw; the browser login is safer.', sensitive: true, required: false, default: '' },
    max_margin_usd: { type: 'number', title: 'Max margin per trade (USD)', description: 'Guardrail for headless trading.', required: false, default: 50, min: 10, max: 100000 },
    max_leverage: { type: 'number', title: 'Max leverage', description: 'Guardrail for headless trading (1 to 1000).', required: false, default: 500, min: 1, max: 1000 },
  },
  compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: '>=20.10.0' } },
};
await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

execFileSync('npx', ['-y', '@anthropic-ai/mcpb@latest', 'pack', stage, join(root, 'build/papertrade-ai.mcpb')], { stdio: 'inherit' });
