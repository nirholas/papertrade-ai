---
title: Security model
description: How Papertrade AI keeps your wallet safe. Non-custodial session keys that cannot withdraw, server-enforced guardrails, preview-then-confirm trading, encrypted storage and instant revocation.
---

# Security model

Papertrade AI lets an AI model place real trades with real money, so the design starts from one question: what is the worst thing a confused or manipulated model can do? The answer is bounded by limits you choose, enforced outside the model.

## What your wallet signs

| Mode | What you sign | What it allows |
| --- | --- | --- |
| Read only | A plain-text login message (`personal_sign`) that names the app, the server, a nonce and the time it was issued. It costs nothing and is not a transaction. | Reading your balances, positions and history. Nothing else. |
| Trade with guardrails | One EIP-712 `RegisterSessionKey` message on HyperEVM (chain 999), the same message the official Papertrade app signs when you enable one-click trading. | A fresh session key may sign Papertrade `Open`, `Close` and `Cancel` intents for 30 days. |

You never paste a private key into a website or a chat. The browser page uses your own wallet extension through [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) discovery.

## What the session key cannot do

Papertrade session keys are scoped by the exchange contract itself. A session key cannot:

- withdraw funds or request a withdrawal;
- transfer USDC, PAPER or any token;
- register other session keys or change your account;
- sign anything outside Papertrade intents.

The worst case for a leaked session key is trades on your Papertrade margin, which is exactly why the guardrails below exist and why you should keep only the margin you intend to trade on Papertrade.

## Guardrails, enforced on the server

The limits you set on the connect page are stored with the grant and checked by the server before any intent is signed, in code the model cannot reach:

- **Max margin per trade** (default $50)
- **Max leverage** (default 500x, exchange max 1000x)
- **Max total position size per rolling 24 hours** (default $250,000 notional), counted from your live Papertrade positions and trade history, not from a local counter
- **Max open positions** (default 5)
- **Allowed markets** (BTC, ETH)
- **Require confirmation** (default on)

A request outside the limits fails with a clear message, and the model is told that only the wallet owner can change limits by reconnecting.

## Preview, then confirm

Opening a position is always two tool calls:

1. `preview_trade` checks exchange limits, your balance and your guardrails, prices the entry, liquidation price and PnL scenarios, and returns a `quoteId`.
2. `open_position` only accepts a `quoteId` for the identical market, side, margin and leverage, signed by the server with HMAC and valid for 3 minutes.

With "require confirmation" on, the assistant must show you the preview and get your explicit yes before step 2. `open_position` and `close_positions` are annotated `destructiveHint: true`, so clients that support MCP tool annotations prompt you before running them.

## How keys are stored

- **Remote server.** The session private key is stored only inside the OAuth grant of the app you connected, encrypted at rest by [`@cloudflare/workers-oauth-provider`](https://github.com/cloudflare/workers-oauth-provider) with a key derived from that app's access token. The server cannot read it without a valid token from your assistant. Revoking the app deletes the grant and the key.
- **Local CLI.** `papertrade-ai login` writes `~/.config/papertrade-ai/credentials.json` with file mode 0600. `papertrade-ai logout` deletes it.

## OAuth and transport

- OAuth 2.1 with PKCE, Dynamic Client Registration ([RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591)) and Client ID Metadata Documents.
- Protected Resource Metadata ([RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728)) at `/.well-known/oauth-protected-resource`.
- Scopes: `trade:read`, `trade:write`, `offline_access`. A client that did not request `trade:write` is never offered trading.
- Access tokens last 1 hour, refresh tokens 30 days. Connecting the same wallet to the same app again replaces the previous grant.
- The connect and account pages ship a strict Content Security Policy, deny framing, check `Origin` on every state-changing request, and seal every handle with AES-GCM and purpose binding.

## Untrusted data

Leaderboard names, wallet labels and other text that comes from the exchange are data, not instructions. The server returns them as structured fields and never acts on them. Trades only originate from an explicit tool call in a session the wallet owner approved.

## Risk

Papertrade offers up to 1000x leverage. At 1000x a 0.1% move against you liquidates the position and the full margin is lost. Papertrade AI is open-source software, not financial advice, and is not affiliated with Papertrade. The Papertrade API it uses is public but undocumented; behavior was verified against mainnet on 2026-10-10.

## Reporting a vulnerability

See [SECURITY.md](https://github.com/nirholas/papertrade-ai/blob/main/SECURITY.md). Please report privately through GitHub Security Advisories, not in a public issue.
