import { z } from 'zod/v4';
import { SERVER_VERSION } from './core/constants.js';
import { TOOLS } from './tools/registry.js';

/**
 * OpenAPI 3.1 for the REST mirror of the tool registry. Public tools are served without auth at
 * /api/v1/tools/{name}; the same tools plus trading are served at /api/v1/me/tools/{name} with an
 * OAuth bearer token from this server, which is what GPT Actions and plain HTTP agents use.
 */
export function openApiDocument(publicUrl: string) {
  const paths: Record<string, unknown> = {};
  const errorResponse = {
    description: 'The tool refused or failed. `error.message` is written for the end user.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: { ok: { const: false }, error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] } },
          required: ['ok', 'error'],
        },
      },
    },
  };
  for (const t of TOOLS) {
    const schema = z.toJSONSchema(t.input, { target: 'openapi-3.0', io: 'input' }) as Record<string, unknown>;
    delete schema.$schema;
    const op = (authenticated: boolean) => ({
      operationId: authenticated ? `me_${t.name}` : t.name,
      summary: t.title,
      description: t.description,
      tags: [t.access === 'trade' ? 'Trading' : t.access === 'wallet' ? 'Account' : 'Market data'],
      ...(authenticated ? { security: [{ oauth: t.access === 'trade' ? ['trade:write'] : ['trade:read'] }] } : { security: [] }),
      ...(t.annotations.destructiveHint ? { 'x-openai-isConsequential': true } : { 'x-openai-isConsequential': false }),
      requestBody: { required: false, content: { 'application/json': { schema } } },
      responses: {
        '200': {
          description: 'Tool result: a summary to relay to the user, and structured data.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { ok: { const: true }, summary: { type: 'string' }, data: { type: 'object', additionalProperties: true } }, required: ['ok', 'summary', 'data'] },
            },
          },
        },
        '400': errorResponse,
        '401': { description: 'Missing or invalid bearer token.' },
        '502': errorResponse,
      },
    });
    if (t.access === 'public') paths[`/api/v1/tools/${t.name}`] = { post: op(false) };
    paths[`/api/v1/me/tools/${t.name}`] = { post: op(true) };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Papertrade AI',
      version: SERVER_VERSION,
      summary: 'Trade Papertrade BTC and ETH perps from any AI agent.',
      description:
        'Market data, analytics and guarded trading for Papertrade (HyperEVM perps priced off Hyperliquid). The same tools are served over MCP at /mcp. Trading requires the wallet owner to approve a session key with guardrails; the key cannot withdraw.',
      license: { name: 'MIT', identifier: 'MIT' },
      contact: { url: 'https://github.com/nirholas/papertrade-ai' },
    },
    servers: [{ url: publicUrl }],
    tags: [
      { name: 'Market data', description: 'No authentication.' },
      { name: 'Account', description: 'Connected wallet views.' },
      { name: 'Trading', description: 'Requires the trade:write scope.' },
    ],
    components: {
      securitySchemes: {
        oauth: {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: `${publicUrl}/authorize`,
              tokenUrl: `${publicUrl}/token`,
              refreshUrl: `${publicUrl}/token`,
              scopes: { 'trade:read': 'Read the connected account.', 'trade:write': 'Open and close positions within the owner guardrails.', offline_access: 'Stay connected.' },
            },
          },
        },
      },
    },
    paths,
  };
}
