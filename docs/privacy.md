---
title: Privacy policy
description: What data Papertrade AI stores, why, for how long, and how to delete it.
---

# Privacy policy

Effective 2026-10-10. This policy covers the hosted Papertrade AI server at `papertrade-ai.ninabrekkerese.workers.dev` and the `papertrade-ai` npm package.

## What we store

When you connect an AI app, the server stores one OAuth grant in Cloudflare Workers KV containing:

- your wallet address;
- the name of the AI app you connected;
- the access mode (read only or trading), the guardrails you chose and the time you connected;
- in trading mode, the session key's address, expiry and private key.

Grant contents that include the session private key are encrypted at rest with a key derived from that app's access token. Access tokens expire after 1 hour and refresh tokens after 30 days.

## What we do not store

- Your wallet's private key or seed phrase. You sign in your own wallet; the server only receives signatures.
- Chat content. The server sees tool calls and their arguments, never the conversation.
- Analytics, cookies for tracking, or advertising identifiers. The only cookies are short-lived, `__Host-` prefixed cookies used during the OAuth consent step.

## Logs

Cloudflare keeps standard request logs (time, path, status, IP) for operational debugging under its own retention policy. Error logs never include tokens, signatures or keys.

## Third parties

Tool calls fetch public data from Papertrade (`exchange.papertrade.xyz`), Hyperliquid (`api.hyperliquid.xyz`) and HyperEVM RPC. Trades you approve are submitted to Papertrade as signed intents. No data is sold or shared for any other purpose.

## Deleting your data

Revoke the app at [/account](https://papertrade-ai.ninabrekkerese.workers.dev/account). The grant, tokens and session key are deleted immediately. Grants also expire on their own when the refresh token lapses.

## Local CLI

The npm package stores credentials only on your machine, in `~/.config/papertrade-ai/credentials.json` (mode 0600). `papertrade-ai logout` deletes them.

## Contact

Open an issue at [github.com/nirholas/papertrade-ai](https://github.com/nirholas/papertrade-ai/issues), or report security issues privately as described in [SECURITY.md](https://github.com/nirholas/papertrade-ai/blob/main/SECURITY.md).
