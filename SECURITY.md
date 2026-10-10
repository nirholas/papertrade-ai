# Security policy

Papertrade AI lets AI assistants place real trades, so security reports get priority.

## Reporting a vulnerability

Report privately through [GitHub security advisories](https://github.com/nirholas/papertrade-ai/security/advisories/new). Do not open a public issue for a vulnerability.

Include what you found, how to reproduce it, and the impact. You will get an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for confirmed issues.

## Scope

In scope:

- the hosted server at `papertrade-ai.ninabrekkerese.workers.dev` (OAuth, MCP, REST, connect and account pages);
- the `papertrade-ai` npm package and CLI;
- anything that lets a model, a third party or another user act outside the guardrails a wallet owner set, read or use another user's session key, or bypass preview-then-confirm.

Out of scope: the Papertrade exchange and its contracts (report those to Papertrade), denial of service by volume, and missing headers without a demonstrated impact.

## Design

The threat model and controls are documented in [docs/security.md](docs/security.md).
