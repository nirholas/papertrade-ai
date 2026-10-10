---
title: OpenAI Codex
description: Add Papertrade AI to the OpenAI Codex CLI and IDE extension as a remote MCP server with OAuth, or run it locally over stdio.
---

# OpenAI Codex

Codex supports remote MCP servers with OAuth in the CLI and the IDE extension. Both share `~/.codex/config.toml`.

## Remote server (recommended)

```
codex mcp add papertrade --url https://papertrade-ai.ninabrekkerese.workers.dev/mcp
codex mcp login papertrade
```

`codex mcp login` opens the Papertrade AI connect page in your browser. Choose **Read only** or **Trade with guardrails** and sign with your wallet.

The resulting `config.toml` entry:

```toml
[mcp_servers.papertrade]
url = "https://papertrade-ai.ninabrekkerese.workers.dev/mcp"
```

## Local stdio server

```
npx -y papertrade-ai login
codex mcp add papertrade -- npx -y papertrade-ai
```

Or by hand:

```toml
[mcp_servers.papertrade]
command = "npx"
args = ["-y", "papertrade-ai"]
```

For read-only access without logging in, add `env = { PAPERTRADE_WALLET = "0xYourWallet" }`.

## Using it

Run `/mcp` in Codex to confirm the server and its 18 tools are loaded, then ask:

- "Pull the BTC 1h chart from Papertrade and summarize the trend."
- "Write a script that logs the Papertrade leaderboard every hour" (Codex can read the [REST API](rest-api.md) docs).
- "Preview a $20 ETH long at 300x."

Codex asks for approval before running tools that are annotated as destructive (`open_position`, `close_positions`).
