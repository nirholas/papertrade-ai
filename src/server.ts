import { McpServer } from '@modelcontextprotocol/server';
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { SERVER_NAME, SERVER_VERSION, UserFacingError } from './core/constants.js';
import { INSTRUCTIONS, TOOLS, type AnyTool, type ToolContext, type ToolResult } from './tools/registry.js';
import { WIDGET_HTML } from './generated/assets.js';

export const WIDGET_URI = 'ui://papertrade/ticket.html';

/** Origins the widget fetches from directly (live price ticks); everything else goes through tools. */
const WIDGET_CSP = {
  connectDomains: ['https://api.hyperliquid.xyz', 'https://exchange.papertrade.xyz'],
  resourceDomains: [] as string[],
};

const INVOKING: Record<string, [string, string]> = {
  preview_trade: ['Pricing your trade', 'Trade previewed'],
  open_position: ['Opening position', 'Position update'],
  close_positions: ['Closing positions', 'Close update'],
  get_account: ['Loading account', 'Account loaded'],
};

function errorResult(err: unknown) {
  const e = err instanceof UserFacingError ? err : new UserFacingError(err instanceof Error ? err.message : String(err), 'internal_error');
  return {
    isError: true,
    content: [{ type: 'text' as const, text: e.message }],
    structuredContent: { error: { code: e.code, message: e.message } },
  };
}

function okResult(res: ToolResult) {
  return { content: [{ type: 'text' as const, text: res.summary }], structuredContent: res.data };
}

/** Tools a connection may see. Trading tools are listed only when a trading session exists. */
export function visibleTools(ctx: ToolContext): AnyTool[] {
  const canTrade = Boolean(ctx.principal.session && ctx.principal.policy);
  return TOOLS.filter((t) => t.access !== 'trade' || canTrade);
}

export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      title: 'Papertrade',
      version: SERVER_VERSION,
      websiteUrl: 'https://papertrade-ai.ninabrekkerese.workers.dev',
    },
    { instructions: INSTRUCTIONS },
  );

  for (const def of visibleTools(ctx)) {
    const run = async (args: unknown) => {
      try {
        return okResult(await (def.run as (a: unknown, c: ToolContext) => Promise<ToolResult>)(args, ctx));
      } catch (err) {
        return errorResult(err);
      }
    };
    const base = { title: def.title, description: def.description, inputSchema: def.input, annotations: { title: def.title, ...def.annotations } };
    if (def.widget) {
      const [invoking, invoked] = INVOKING[def.name] ?? ['Working', 'Done'];
      registerAppTool(
        server,
        def.name,
        {
          ...base,
          _meta: {
            ui: { resourceUri: WIDGET_URI },
            'openai/outputTemplate': WIDGET_URI,
            'openai/widgetAccessible': true,
            'openai/toolInvocation/invoking': invoking,
            'openai/toolInvocation/invoked': invoked,
          },
        },
        run,
      );
    } else {
      server.registerTool(def.name, base, run);
    }
  }

  registerAppResource(
    server,
    'Papertrade trade ticket',
    WIDGET_URI,
    { description: 'Interactive trade preview, confirmation and account view for Papertrade perps.' },
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: WIDGET_HTML,
          _meta: {
            ui: { csp: WIDGET_CSP, prefersBorder: true },
            'openai/widgetDescription': 'Shows the trade preview with a confirm button, fills, and the live account with close buttons.',
            'openai/widgetPrefersBorder': true,
            'openai/widgetCSP': { connect_domains: WIDGET_CSP.connectDomains, resource_domains: WIDGET_CSP.resourceDomains },
          },
        },
      ],
    }),
  );

  return server;
}
