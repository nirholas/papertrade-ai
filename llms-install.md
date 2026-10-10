# Installing Papertrade AI

Instructions for AI agents (Cline, Roo, Claude Code and similar) installing this MCP server for a user.

Papertrade AI lets an assistant read live Papertrade BTC and ETH perpetual markets and analytics, and trade on the user's behalf within guardrails the user sets. There are two ways to install it. Prefer the remote server.

## Option 1: remote server (recommended, nothing to install)

Add this to the MCP settings file:

```json
{
  "mcpServers": {
    "papertrade": {
      "type": "streamableHttp",
      "url": "https://papertrade-ai.ninabrekkerese.workers.dev/mcp"
    }
  }
}
```

Some clients name the type `"http"` or `"streamable-http"`; use whatever your client expects for Streamable HTTP. The server uses OAuth 2.1 with dynamic client registration: on first use the client opens a browser page where the user connects a wallet and picks read only or trading with guardrails. No API key is needed.

If the client cannot do OAuth, use the read-only endpoint, which needs no authentication:

```json
{
  "mcpServers": {
    "papertrade": {
      "type": "streamableHttp",
      "url": "https://papertrade-ai.ninabrekkerese.workers.dev/public/mcp"
    }
  }
}
```

## Option 2: local stdio server

Requires Node.js 20.10 or newer.

```json
{
  "mcpServers": {
    "papertrade": {
      "command": "npx",
      "args": ["-y", "papertrade-ai"]
    }
  }
}
```

Then the user runs `npx -y papertrade-ai login` once in a terminal to connect a wallet in the browser. For read-only access without logging in, add `"env": { "PAPERTRADE_WALLET": "0x..." }` with the user's wallet address.

Do not ask the user for a private key. Trading keys are created by the login flow and cannot withdraw funds.

## Verify

Call the `get_markets` tool. It should return live BTC and ETH prices. Docs: https://papertrade-ai.ninabrekkerese.workers.dev/docs/
