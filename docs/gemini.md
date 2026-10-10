---
title: Gemini CLI
description: Install Papertrade AI as a Gemini CLI extension, or add it as a remote MCP server with OAuth. Trade Papertrade perps from the Gemini command line.
---

# Gemini CLI

## Extension (recommended)

The repository is a Gemini CLI extension. It registers the remote server and loads a context file that teaches Gemini the preview-then-confirm trading workflow.

```
gemini extensions install https://github.com/nirholas/papertrade-ai
```

Start `gemini`, run `/mcp auth papertrade`, and sign in with your wallet in the browser.

Update later with `gemini extensions update papertrade-ai`.

## Plain MCP server

```
gemini mcp add --transport http papertrade https://papertrade-ai.ninabrekkerese.workers.dev/mcp
```

Or in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "papertrade": {
      "httpUrl": "https://papertrade-ai.ninabrekkerese.workers.dev/mcp"
    }
  }
}
```

Gemini CLI discovers the OAuth endpoints from the server automatically.

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

Run `npx -y papertrade-ai login` once first.

## Using it

Run `/mcp` to list the Papertrade tools, then ask "show me the Papertrade liquidation map for BTC". Gemini asks before running tools unless you start it with `--yolo`; do not use `--yolo` with a trading session.
