---
title: FAQ
description: Answers about Papertrade AI. Is it safe, which AI apps work, what it costs, what the session key can do, minimums, leverage, liquidation and how to revoke access.
---

# FAQ

## What is Papertrade AI?

An open-source MCP server that connects AI assistants (Claude, ChatGPT, Codex, Cursor, VS Code, Gemini CLI and any MCP client) to Papertrade, a perpetual futures exchange for BTC and ETH on HyperEVM with up to 1000x leverage. Your assistant can read markets and analytics, inspect any wallet, and, if you allow it, trade for you within guardrails you set.

## Is it official?

No. Papertrade AI is an independent open-source project, not affiliated with Papertrade. It uses the same public endpoints and the same signed messages as the official web app.

## Does "Papertrade" mean fake money?

No. Despite the name, positions on Papertrade use real USDC deposited to your account, and losses are real. Treat every trade as real money.

## What does it cost?

Papertrade AI is free and MIT licensed. Papertrade charges its own trading fees: a one-time 1 USDC activation fee on the first deposit, and a 2% fee on winning trades, whose payout also follows the exchange win curve (`calculate_position` shows the exact net PnL).

## Can the AI steal my funds?

The trading session key is limited by the Papertrade exchange contract to opening, closing and cancelling positions. It cannot withdraw or transfer funds. Within that, the server enforces your guardrails (max margin, leverage, daily size, open positions, markets) and, by default, requires your explicit confirmation of every trade. See [Security model](security.md).

## What are the minimums?

$10 margin per trade and $10,000 position size (margin times leverage). At $10 margin you need at least 1000x; at $20, at least 500x. Deposits must be at least 10 USDC.

## How does liquidation work?

Each position has a bust price. If the market trades through it, the position closes and the margin is lost. At 1000x the bust price is about 0.1% from entry. `preview_trade` and `calculate_position` show the exact bust price using the exchange's own formula.

## Which assistants show the interactive card?

Clients that support MCP Apps: Claude (web and desktop), ChatGPT, VS Code, Goose and others. Everywhere else the same data arrives as text and structured JSON.

## Do I need to connect a wallet?

Only for your own account and for trading. Markets, charts, the liquidation map, leaderboards, top trades and any wallet lookup work without connecting.

## How do I change my guardrails?

Remove the app in your assistant and connect again; the connect page lets you set new limits. Your old grant is replaced.

## How do I revoke access?

Go to [/account](https://papertrade-ai.ninabrekkerese.workers.dev/account), sign a free message, and click **Revoke**. Tokens and the session key are deleted immediately.

## Why was my trading session rejected?

Papertrade only accepts session keys from wallets that have deposited at least once. Ask your assistant for "Papertrade deposit info" to get your personal deposit address.

## Can I run it myself?

Yes: `npx -y papertrade-ai` locally, or deploy your own Worker. See [Local CLI](cli.md) and [Self-hosting](self-hosting.md).
