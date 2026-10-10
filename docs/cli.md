---
title: Local CLI and stdio server
description: Run Papertrade AI on your own machine with npx. Browser wallet login, headless session keys for bots, read-only mode and every environment variable.
---

# Local CLI

`papertrade-ai` on npm is a stdio MCP server plus a small CLI. Use it when you want the session key on your own disk instead of the hosted server, or for bots and CI.

```
npx -y papertrade-ai --help
```

Requires Node.js 20.10 or newer.

## Commands

| Command | What it does |
| --- | --- |
| `papertrade-ai` | Start the stdio MCP server (what your MCP client runs). |
| `papertrade-ai login` | Open a local browser page, connect your wallet, pick read-only or trading with guardrails. |
| `papertrade-ai login --key` | Headless: register a trading session key using `PAPERTRADE_PRIVATE_KEY`. |
| `papertrade-ai status` | Show the connected wallet, mode, session expiry and guardrails. |
| `papertrade-ai logout` | Delete the saved credentials. |

## Browser login

```
npx -y papertrade-ai login
```

The CLI starts a one-time page on `127.0.0.1` with a random port and opens it. You connect your wallet (any EIP-6963 browser wallet), choose a mode, set guardrails and sign. Credentials are saved to `~/.config/papertrade-ai/credentials.json` with mode 0600. The page shuts down after 15 minutes.

## Headless

For bots and servers, set the wallet key only for the login step. The key signs the session key registration and is never stored:

```
PAPERTRADE_PRIVATE_KEY=0x... PAPERTRADE_MAX_LEVERAGE=200 npx -y papertrade-ai login --key
```

If `PAPERTRADE_PRIVATE_KEY` is set when the server starts, it reuses a live saved session or registers a new one automatically.

## Read only, no login

```
PAPERTRADE_WALLET=0xYourWallet npx -y papertrade-ai
```

Without any wallet, every public market and analytics tool still works.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PAPERTRADE_WALLET` | | Read-only wallet address |
| `PAPERTRADE_PRIVATE_KEY` | | Wallet key used only to sign a session key registration |
| `PAPERTRADE_MAX_MARGIN_USD` | 50 | Guardrail: max margin per trade |
| `PAPERTRADE_MAX_LEVERAGE` | 500 | Guardrail: max leverage |
| `PAPERTRADE_MAX_DAILY_NOTIONAL_USD` | 250000 | Guardrail: max position size opened per rolling 24h |
| `PAPERTRADE_MAX_OPEN_POSITIONS` | 5 | Guardrail: max open positions |
| `PAPERTRADE_MARKETS` | BTC,ETH | Guardrail: allowed markets |
| `PAPERTRADE_REQUIRE_CONFIRMATION` | true | Guardrail: the model must confirm every trade with you |
| `PAPERTRADE_CONFIG_DIR` | `~/.config/papertrade-ai` | Where credentials are stored (respects `XDG_CONFIG_HOME`) |

Guardrails from environment variables apply to headless sessions. Browser login uses the values you set on the page.

## Session expiry

Session keys last 30 days. When one expires the server falls back to read-only and prints a note to stderr; run `login` again.
