---
description: Live Papertrade BTC and ETH markets, open interest and the liquidation map
argument-hint: "[BTC|ETH]"
---

Use the papertrade MCP tools to give me a fast market brief for $ARGUMENTS (both BTC and ETH if empty):

1. `get_markets`: mark price, 24h change, Papertrade 24h volume, long vs short open interest against the caps, max leverage, and whether trading is open.
2. `get_price_chart` with interval `1h` and count `48`: the 48-hour range, trend, and the TradingView link.
3. `get_liquidation_map`: the nearest large liquidation clusters above and below the price.

Finish with three bullet takeaways. Data only, no trade suggestions.
