---
title: Self-hosting
description: Deploy your own Papertrade AI remote MCP server to Cloudflare Workers in five minutes, with OAuth, KV storage and the trading widget.
---

# Self-hosting

The hosted server is one Cloudflare Worker. You can run your own copy so that you, and only you, hold the encrypted session keys.

## Requirements

- A Cloudflare account (the free plan works)
- Node.js 20.10+

## Deploy

```
git clone https://github.com/nirholas/papertrade-ai
cd papertrade-ai
npm install

npx wrangler kv namespace create OAUTH_KV
```

Edit `wrangler.jsonc`:

- set `kv_namespaces[0].id` to the id printed above;
- set `name` to your Worker name;
- set `vars.PUBLIC_URL` to the URL the Worker will be served from (for example `https://papertrade.example.com`).

Then set a random server secret and deploy:

```
openssl rand -base64 48 | npx wrangler secret put SERVER_SECRET
npm run deploy
```

`SERVER_SECRET` seals connect handles and signs trade quotes. Rotating it invalidates in-flight connects and previews only; connected apps keep working because their grants are encrypted with their own tokens.

## Local development

```
cp .dev.vars.example .dev.vars   # then set SERVER_SECRET
npm run dev                       # http://127.0.0.1:8787
```

Set `PUBLIC_URL=http://127.0.0.1:8787` in `.dev.vars`. OAuth allows plain HTTP only on loopback.

## Architecture

| Path | Handler |
| --- | --- |
| `/mcp` | Authenticated MCP (Streamable HTTP, stateless) |
| `/public/mcp` | Unauthenticated MCP with public tools |
| `/authorize`, `/token`, `/register` | OAuth 2.1 via `@cloudflare/workers-oauth-provider` |
| `/account` | Wallet sign-in to list and revoke connected apps |
| `/api/v1/*`, `/openapi.json` | REST API |
| everything else | Static site from `public/` |

Tool logic lives in `src/tools/registry.ts` and is shared by the Worker, the stdio CLI and the npm library, so all three behave identically.

## Tests

```
npm test              # unit tests
npm run test:live     # read-only checks against Papertrade mainnet
npm run typecheck
```
