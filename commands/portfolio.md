---
description: Your Papertrade balance, open positions with liquidation distance, and recent performance
argument-hint: "[wallet address]"
---

Use the papertrade MCP tools to review the Papertrade account for $ARGUMENTS (the connected wallet if empty):

1. `get_account`: balance, every open position with entry, mark, bust price, distance to liquidation in percent, and unrealized PnL.
2. `get_trade_history`: win rate, realized PnL, biggest win and biggest loss.
3. `get_portfolio_history`: the equity curve trend.
4. If a wallet is connected, `get_trading_permissions`: the guardrails and how much of the 24h limit is left.

Flag any position within 0.5% of its bust price first. Do not open or close anything.
