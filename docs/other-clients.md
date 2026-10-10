---
title: Windsurf, Zed, Cline, Goose and other MCP clients
description: Connect Papertrade AI to Windsurf, Zed, Cline, Goose, LibreChat, Continue, Raycast, n8n or any Model Context Protocol client over Streamable HTTP or stdio.
---

# Other MCP clients

Papertrade AI speaks standard MCP, so it works with any client that supports Streamable HTTP or stdio.

- **Remote:** `https://papertrade-ai.ninabrekkerese.workers.dev/mcp` (OAuth 2.1, Dynamic Client Registration, Client ID Metadata Documents)
- **Remote, no auth, public tools only:** `https://papertrade-ai.ninabrekkerese.workers.dev/public/mcp`
- **Local:** `npx -y papertrade-ai`

Use the public endpoint for clients without OAuth support, for bots, or for quick experiments: it serves every market, analytics and wallet-lookup tool, and no trading tools.

## Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "papertrade": {
      "serverUrl": "https://papertrade-ai.ninabrekkerese.workers.dev/mcp"
    }
  }
}
```

## Zed

In `settings.json`:

```json
{
  "context_servers": {
    "papertrade": {
      "url": "https://papertrade-ai.ninabrekkerese.workers.dev/mcp"
    }
  }
}
```

## Cline

Open the MCP Servers panel, choose **Remote Servers**, name it `papertrade` and paste the server URL. Cline can also set up the local server by itself from [llms-install.md](https://github.com/nirholas/papertrade-ai/blob/main/llms-install.md).

## Goose

```
goose configure
```

Choose **Add Extension**, then **Remote Extension (Streamable HTTP)**, and paste the server URL. Goose renders the Papertrade widget through MCP Apps.

## LibreChat

`librechat.yaml`:

```yaml
mcpServers:
  papertrade:
    type: streamable-http
    url: https://papertrade-ai.ninabrekkerese.workers.dev/mcp
```

## Generic stdio config

Most clients accept this shape:

```json
{
  "mcpServers": {
    "papertrade": {
      "command": "npx",
      "args": ["-y", "papertrade-ai"],
      "env": { "PAPERTRADE_WALLET": "0xYourWalletForReadOnly" }
    }
  }
}
```

## MCP Inspector

```
npx @modelcontextprotocol/inspector
```

Transport **Streamable HTTP**, URL `https://papertrade-ai.ninabrekkerese.workers.dev/public/mcp`.

## Agent frameworks

The same tools are available as plain HTTPS endpoints for frameworks that do not speak MCP. See [REST API and OpenAPI](rest-api.md).
