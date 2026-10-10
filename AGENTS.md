# AGENTS.md

Guidance for coding agents working in this repository.

## Layout

- `src/tools/registry.ts`: every MCP tool (zod input, annotations, `run`). Adding a tool here exposes it over MCP, REST, OpenAPI, the docs and `llms.txt` automatically.
- `src/core/`: Papertrade API client, constants, EIP-712 intent signing and bust price math. These mirror the exchange exactly; change them only with a test that pins the new behaviour.
- `src/policy.ts`, `src/quote.ts`, `src/seal.ts`: guardrails, signed preview quotes, session key encryption.
- `src/worker/`: Cloudflare Worker entry (OAuth provider, `/mcp`, `/public/mcp`, `/api/v1`, pages).
- `src/cli.ts`: stdio server and CLI.
- `src/web/`: MCP Apps widget and the connect/account pages, built into `src/generated/assets.ts`.
- `docs/*.md`: documentation. `docs/tools.md` is generated; do not edit it by hand.
- `site/`: website CSS, JS and fonts. `scripts/build-site.mjs` renders `public/` and the root manifests (`server.json`, `gemini-extension.json`, `.claude-plugin/*`, `.mcp.json`, `glama.json`).

## Commands

```bash
npm run build      # dist/ (npm package) and generated assets
npm run site       # public/ website and root manifests (after build)
npm run typecheck
npm test
npm run dev        # wrangler dev
npm run mcpb       # Claude Desktop bundle in build/
```

## Rules

- Trading tools must keep preview-then-confirm and server-side guardrails. Never add a code path that signs an intent without `assertTradeAllowed`.
- Tool results are `{ summary, data }`. Summaries are one line a model can repeat.
- Version lives in `package.json` and `src/core/constants.ts` (`SERVER_VERSION`); the site build fails if they differ.
- No em-dash or en-dash characters anywhere; the site build rejects them.
