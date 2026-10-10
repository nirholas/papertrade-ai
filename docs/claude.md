---
title: Claude, Claude Desktop and Claude Code
description: Add Papertrade AI to Claude.ai, Claude Desktop, Claude mobile and Claude Code as a custom connector, plugin or MCP server, and trade Papertrade perps from chat.
---

# Claude

Papertrade AI works in every Claude surface. The remote server uses OAuth, so you sign in with your wallet in a browser tab and never paste a key.

Server URL:

```
https://papertrade-ai.ninabrekkerese.workers.dev/mcp
```

## Claude.ai, Claude Desktop and Claude mobile

Custom connectors sync across web, desktop and mobile once added.

1. Open **Settings**, then **Connectors**.
2. Click **Add custom connector**.
3. Name it `Papertrade` and paste the server URL above. Leave the OAuth client fields empty: the server supports Dynamic Client Registration and Client ID Metadata Documents.
4. Click **Connect**. A Papertrade AI page opens. Choose **Read only** or **Trade with guardrails**, connect your wallet and sign.
5. In a chat, open the tools menu and make sure Papertrade is enabled.

On Team and Enterprise plans an owner adds the connector once under **Organization settings, Connectors**, and members connect their own wallets.

Market cards, account views and trade previews render as an interactive widget in Claude, with a live candlestick chart.

## Claude Code

### As a plugin (recommended)

The repository is a Claude Code plugin marketplace. The plugin bundles the MCP server, a trading skill that teaches Claude the preview-then-confirm workflow, and slash commands.

```
/plugin marketplace add nirholas/papertrade-ai
/plugin install papertrade-ai@papertrade-ai
```

Then run `/mcp`, select **papertrade**, and authenticate in the browser.

Slash commands included:

| Command | What it does |
| --- | --- |
| `/papertrade-ai:markets` | Live BTC and ETH markets, open interest and liquidation clusters |
| `/papertrade-ai:portfolio` | Your balance, open positions with liquidation distance, and recent PnL |
| `/papertrade-ai:trade` | Preview a trade from a plain-English instruction, then confirm it |
| `/papertrade-ai:whales` | Leaderboard leaders and their current positions |

### As a plain MCP server

```
claude mcp add --transport http papertrade https://papertrade-ai.ninabrekkerese.workers.dev/mcp
```

Add `--scope user` to make it available in every project. Run `/mcp` inside Claude Code to authenticate.

### Local stdio server

If you prefer keys on your own machine:

```
npx -y papertrade-ai login
claude mcp add papertrade -- npx -y papertrade-ai
```

See [Local CLI](cli.md).

## Claude Desktop with a local server

Claude Desktop also installs the one-click bundle `papertrade-ai.mcpb` from the [latest GitHub release](https://github.com/nirholas/papertrade-ai/releases/latest). Double-click it, or add this to `claude_desktop_config.json`:

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

Run `npx -y papertrade-ai login` once in a terminal first to connect your wallet, or set `PAPERTRADE_WALLET` in `env` for read-only access.

## Tips

- Ask Claude to "preview" before every trade. With confirmation on (the default) it must show you the preview and wait for your yes.
- Ask "what are my trading permissions?" to see the guardrails and how much of today's limit is left.
- To change guardrails, remove the connector and add it again. To cut access instantly, revoke it at [/account](https://papertrade-ai.ninabrekkerese.workers.dev/account).
