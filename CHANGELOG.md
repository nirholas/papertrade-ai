# Changelog

## 0.1.0 (2026-10-10)

First release.

- Remote MCP server on Cloudflare Workers with OAuth 2.1 and dynamic client registration, plus an unauthenticated read-only endpoint at `/public/mcp`.
- 18 tools: live markets, price charts with TradingView links, protocol stats, liquidation map, leaderboard, top and recent trades, any wallet's account, trade history and equity curve, position calculator, deposit instructions, trading permissions, and guarded trading (preview, open, close, cancel, intent status).
- Non-custodial trading through Papertrade session keys registered with one EIP-712 signature, with server-enforced guardrails and signed preview quotes.
- MCP Apps widget with a live chart for Claude, ChatGPT, VS Code and Goose.
- REST API and OpenAPI 3.1 document for every public tool.
- Local stdio server and CLI on npm (`npx -y papertrade-ai`), with browser and headless login.
- Claude Code plugin with a trading skill and slash commands, Gemini CLI extension, Claude Desktop bundle (`.mcpb`).
- Website with documentation, `llms.txt`, MCP server card and AI catalog.
