---
title: Getting started
description: Connect Papertrade AI to your AI assistant in under a minute, read live Papertrade markets, and enable guarded trading with a session key.
---

# Getting started

Papertrade AI is a [Model Context Protocol](https://modelcontextprotocol.io) server for [Papertrade](https://exchange.papertrade.xyz), the BTC and ETH perpetuals exchange on HyperEVM. Add one URL to your AI assistant and it can read live markets, analyze any wallet, and, once you approve a trading session, open and close positions for you within limits you set.

```
https://papertrade-ai.ninabrekkerese.workers.dev/mcp
```

## 1. Add the server

Pick your assistant. Every client below supports the remote URL with OAuth, so there is nothing to install.

| Assistant | How |
| --- | --- |
| Claude (web, desktop, mobile) | Settings, Connectors, Add custom connector, paste the URL. [Guide](claude.md) |
| Claude Code | `claude mcp add --transport http papertrade https://papertrade-ai.ninabrekkerese.workers.dev/mcp` [Guide](claude.md#claude-code) |
| ChatGPT | Settings, Apps, Advanced settings, Developer mode, Create app, paste the URL. [Guide](chatgpt.md) |
| OpenAI Codex | `codex mcp add papertrade --url https://papertrade-ai.ninabrekkerese.workers.dev/mcp` [Guide](codex.md) |
| Cursor | One click from the [home page](https://papertrade-ai.ninabrekkerese.workers.dev/#install). [Guide](cursor.md) |
| VS Code (Copilot) | One click from the [home page](https://papertrade-ai.ninabrekkerese.workers.dev/#install). [Guide](vscode.md) |
| Gemini CLI | `gemini extensions install https://github.com/nirholas/papertrade-ai` [Guide](gemini.md) |
| Anything else | Any MCP client that speaks Streamable HTTP, or `npx -y papertrade-ai` over stdio. [Guide](other-clients.md) |

## 2. Choose an access level

When your assistant connects, a Papertrade AI page opens in your browser. You pick one of two modes:

- **Read only.** Sign a free login message with your wallet. Your assistant can read your balance, positions, trade history and equity curve. It cannot trade. You can also skip the wallet entirely: every market, leaderboard and analytics tool works without connecting.
- **Trade with guardrails.** Your wallet signs one EIP-712 message that registers a fresh session key with Papertrade for 30 days. You set the limits on the same page:
  - max margin per trade
  - max leverage
  - max total position size per 24 hours
  - max open positions
  - which markets
  - whether every trade needs your explicit confirmation in chat

The session key can open and close positions. It cannot withdraw, transfer or touch anything else in your wallet. See [Security model](security.md).

## 3. Talk to it

Try:

- "What are BTC and ETH doing on Papertrade right now?"
- "Show me the Papertrade liquidation map for ETH."
- "Who are the top 10 traders this week by PnL? What are they holding?"
- "Analyze wallet 0x... : win rate, biggest trade, equity curve."
- "If I long BTC with $20 at 500x, where is my liquidation price?"
- "Open a $15 ETH short at 800x." (preview first, then confirm)
- "Close all my BTC positions."

On clients that support [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps) (Claude, ChatGPT, VS Code, Goose and others), markets, accounts and trade previews render as an interactive card with a live chart instead of plain text.

## 4. Fund your account

Papertrade accounts are funded with USDC on Hyperliquid. Ask your assistant to "show my Papertrade deposit info": the `get_deposit_info` tool returns your personal deposit proxy address, the 10 USDC minimum and the 1 USDC one-time activation fee. A wallet must have deposited at least once before Papertrade will accept a trading session key.

## Manage or revoke access

Open [papertrade-ai.ninabrekkerese.workers.dev/account](https://papertrade-ai.ninabrekkerese.workers.dev/account), sign in with your wallet (a free signature), and revoke any connected app. Revoking deletes its tokens and its encrypted session key immediately. To change guardrails, remove the app in your assistant and connect it again.

## Next

- [Tool reference](tools.md): all 18 tools, inputs and outputs.
- [Security model](security.md): what the server can and cannot do with your wallet.
- [REST API and OpenAPI](rest-api.md): call the same tools over plain HTTPS.
- [Local CLI](cli.md): run the server on your own machine with `npx`.
- [Self-hosting](self-hosting.md): deploy your own copy to Cloudflare.
