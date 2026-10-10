---
description: What the top Papertrade traders are holding right now
argument-hint: "[24h|7d|30d|all]"
---

Use the papertrade MCP tools to show me what the best Papertrade traders are doing (window: $ARGUMENTS, default 7d):

1. `get_leaderboard` with that `window`: the top 10 with window PnL, volume and open positions.
2. `get_account` for each of the top 5: their open positions (market, side, size, leverage, entry, bust price).
3. `get_top_trades`: the biggest recent fills.

Summarize the net long or short bias of the top traders per market, and any crowded side. Data only, no trade suggestions.
