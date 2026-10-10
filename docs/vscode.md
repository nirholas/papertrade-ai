---
title: VS Code and GitHub Copilot
description: Install Papertrade AI in VS Code for GitHub Copilot agent mode with one click, the command line, or mcp.json. Interactive Papertrade trading cards render in chat.
---

# VS Code (GitHub Copilot)

## One click

Use the **Install in VS Code** button on the [home page](https://papertrade-ai.ninabrekkerese.workers.dev/#install) or in the [README](https://github.com/nirholas/papertrade-ai#install). VS Code opens the MCP server install view. Click **Install**, then **Start**; VS Code walks you through the OAuth sign-in.

## Command line

```
code --add-mcp '{"name":"papertrade","type":"http","url":"https://papertrade-ai.ninabrekkerese.workers.dev/mcp"}'
```

## mcp.json

In your workspace `.vscode/mcp.json`, or your user profile via **MCP: Open User Configuration**:

```json
{
  "servers": {
    "papertrade": {
      "type": "http",
      "url": "https://papertrade-ai.ninabrekkerese.workers.dev/mcp"
    }
  }
}
```

Local stdio variant:

```json
{
  "servers": {
    "papertrade": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "papertrade-ai"]
    }
  }
}
```

## Using it

Open Copilot Chat, switch to **Agent** mode, and check Papertrade in the tools picker. VS Code supports MCP Apps, so markets, accounts and trade previews render as an interactive card with a live chart. Copilot asks for confirmation before tools annotated as destructive.
