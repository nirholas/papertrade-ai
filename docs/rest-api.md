---
title: REST API and OpenAPI
description: Call every Papertrade AI tool over plain HTTPS. Free public endpoints for Papertrade markets, charts, liquidation maps, leaderboards and wallet analytics, with an OpenAPI 3.1 document for GPT Actions and agent frameworks.
---

# REST API and OpenAPI

Every MCP tool is also an HTTPS endpoint, for agent frameworks, GPT Actions, bots, dashboards and scripts that do not speak MCP.

- Base URL: `https://papertrade-ai.ninabrekkerese.workers.dev`
- OpenAPI 3.1: [`/openapi.json`](https://papertrade-ai.ninabrekkerese.workers.dev/openapi.json) (also at `/.well-known/openapi.json`)
- CORS: open (`Access-Control-Allow-Origin: *`) on all public endpoints

## Public tools (no auth)

```
GET  /api/v1/tools                  list tools with descriptions and annotations
GET  /api/v1/tools/{name}?arg=value query-string arguments (numbers and booleans are coerced)
POST /api/v1/tools/{name}           JSON body arguments
```

Examples:

```
curl https://papertrade-ai.ninabrekkerese.workers.dev/api/v1/tools/get_markets

curl "https://papertrade-ai.ninabrekkerese.workers.dev/api/v1/tools/get_price_chart?market=ETH&interval=1h"

curl -X POST https://papertrade-ai.ninabrekkerese.workers.dev/api/v1/tools/calculate_position \
  -H 'content-type: application/json' \
  -d '{"market":"BTC","side":"long","entryPrice":83000,"marginUsd":20,"leverage":500,"exitPrice":83500}'
```

## Response shape

Success:

```json
{
  "ok": true,
  "summary": "BTC 83023 (0.59% 24h), ... Minimum margin $10.00, minimum position size $10,000.",
  "data": { "markets": [ { "market": "BTC", "markPrice": 83023, "maxLeverage": 1000 } ] }
}
```

`summary` is a human-readable sentence the model (or your UI) can show directly. `data` is structured and stable.

Error:

```json
{ "ok": false, "error": { "code": "wallet_required", "message": "No wallet given and none is connected. ..." } }
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid arguments or a business rule (guardrail, exchange limit). The message says how to fix it. |
| 401 | The tool needs an OAuth token. |
| 404 | Unknown tool. |
| 502 | Papertrade or Hyperliquid did not answer, or rate-limited us. Retry shortly. |

## Authenticated tools

With an OAuth access token from the same flow MCP clients use (see the authorization server metadata at `/.well-known/oauth-authorization-server`):

```
GET  /api/v1/me                     wallet, mode, canTrade and guardrails for the token
POST /api/v1/me/tools/{name}        any tool, as the connected wallet
```

```
curl -X POST https://papertrade-ai.ninabrekkerese.workers.dev/api/v1/me/tools/get_account \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'
```

Trading tools on this path enforce the same guardrails and preview-then-confirm flow as MCP.

## Library

The npm package exports the same tool registry for Node.js:

```js
import { runTool } from 'papertrade-ai';

const res = await runTool('get_liquidation_map', { market: 'ETH' }, {
  principal: {},
  quoteSecret: crypto.randomUUID(),
  connectHint: 'npx papertrade-ai login',
});
console.log(res.summary);
```

## Fair use

The public endpoints are cached for 5 seconds and proxy Papertrade and Hyperliquid public data. Please poll no faster than once per second; for streaming, use the Papertrade SSE endpoints directly.
