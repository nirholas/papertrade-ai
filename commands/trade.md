---
description: Preview a Papertrade trade, then open it only after you confirm
argument-hint: "<long|short> <BTC|ETH> <margin USD> <leverage>x"
---

I want to trade on Papertrade: $ARGUMENTS

1. Parse side, market, margin in USD and leverage. If anything is missing or the size is below $10 margin or $10,000 notional, suggest a valid combination and stop.
2. Call `preview_trade` and show me: entry price, bust (liquidation) price, distance to liquidation in percent, PnL at +1% and -1%, and fees.
3. Ask me to confirm. Do not call `open_position` until I reply yes in this conversation.
4. After I confirm, call `open_position` with the same market, side, margin and leverage plus the `quoteId`, and report the fill (entry and bust price). If it is still pending, check it with `get_intent_status`.

If a guardrail blocks the trade, tell me which limit and stop.
