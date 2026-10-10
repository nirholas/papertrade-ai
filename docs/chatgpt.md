---
title: ChatGPT
description: Use Papertrade AI in ChatGPT as an app in developer mode, or build a custom GPT with Actions from the OpenAPI document. Live Papertrade perps markets and guarded trading in ChatGPT.
---

# ChatGPT

There are two ways to use Papertrade AI in ChatGPT: as an **app** over MCP (full read and trade, interactive widget), or as a **custom GPT** with Actions over the REST API (public market data and analytics).

## App (MCP, developer mode)

Available on Plus, Pro, Business, Enterprise and Edu plans. On Business and Enterprise an admin may need to allow custom apps first.

1. Open **Settings**, then **Apps** (called Connectors on some plans), then **Advanced settings**, and turn on **Developer mode**.
2. Back in **Apps**, click **Create app**.
3. Fill in:
   - **Name:** Papertrade
   - **Description:** Live Papertrade BTC and ETH perps markets, wallet analytics and guarded trading.
   - **MCP server URL:** `https://papertrade-ai.ninabrekkerese.workers.dev/mcp`
   - **Authentication:** OAuth
4. Click **Create**. ChatGPT opens the Papertrade AI connect page. Choose **Read only** or **Trade with guardrails**, connect your wallet and sign.
5. In a new chat, click **+**, choose **Developer mode**, and enable Papertrade.

Markets, accounts and trade previews render inline as an interactive card. ChatGPT asks you to confirm before it runs `open_position` or `close_positions`, because both tools are annotated as destructive.

## Custom GPT with Actions

For a public GPT that answers questions about Papertrade markets, traders and liquidations without any wallet:

1. In the GPT editor, open **Configure**, then **Create new action**.
2. Click **Import from URL** and enter `https://papertrade-ai.ninabrekkerese.workers.dev/openapi.json`.
3. Authentication: **None**. Privacy policy: `https://papertrade-ai.ninabrekkerese.workers.dev/privacy`.
4. Suggested instructions:

```
You are a Papertrade analyst. Use the actions to fetch live data before answering.
Always state the market, the time window and the source. Papertrade allows up to
1000x leverage; when discussing positions, show the liquidation price and distance.
Never give financial advice.
```

The OpenAPI document exposes every public tool as a `GET` and `POST` operation. Trading needs a wallet session, so it is only available through the app (MCP) path above.

## Troubleshooting

- **"Trading is not enabled for this connection".** You connected in read-only mode. Remove the app and create it again, choosing **Trade with guardrails**.
- **"account_not_activated".** Papertrade only accepts a trading session from a wallet that has deposited at least once. Ask "how do I deposit to Papertrade?" for your personal deposit address.
- **The app does not appear in a chat.** Developer mode apps must be enabled per chat from the **+** menu.
