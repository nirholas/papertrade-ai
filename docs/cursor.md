---
title: Cursor
description: One-click install of Papertrade AI in Cursor. Read live Papertrade perps markets and trade BTC and ETH with guardrails from Cursor's agent.
---

# Cursor

## One click

Use the **Add to Cursor** button on the [home page](https://papertrade-ai.ninabrekkerese.workers.dev/#install) or in the [README](https://github.com/nirholas/papertrade-ai#install). Cursor opens, shows the server, and asks you to install it. Then click **Connect** next to Papertrade in **Settings, MCP** to sign in with your wallet.

## Manually

Add this to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "papertrade": {
      "url": "https://papertrade-ai.ninabrekkerese.workers.dev/mcp"
    }
  }
}
```

## Local stdio server

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

Run `npx -y papertrade-ai login` once first, or add `"env": { "PAPERTRADE_WALLET": "0x..." }` for read-only access.

## Using it

Open the agent panel and ask "what are Papertrade BTC and ETH doing?". Cursor asks before running each tool unless you allow it; keep confirmation on for `open_position` and `close_positions`.
