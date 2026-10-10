/** Library entry: embed the Papertrade MCP server or call its tools directly from your own agent. */
export { createServer, visibleTools, WIDGET_URI } from './server.js';
export { TOOLS, findTool, runTool, INSTRUCTIONS, type Principal, type ToolContext, type ToolDef, type AnyTool } from './tools/registry.js';
export { DEFAULT_POLICY, PolicySchema, policyFromEnv, checkTrade, assertTradeAllowed, type Policy } from './policy.js';
export { beginConnect, finishConnect, walletTypedData, type ConnectGrant, type PendingConnect } from './connect.js';
export { registrationTypedData, verifyRegistration, submitRegistration, openPosition, closePositions, cancelIntent, type SessionCredential } from './core/intents.js';
export { openApiDocument } from './openapi.js';
export { PAPERTRADE, INSTRUMENTS, SERVER_NAME, SERVER_VERSION, UserFacingError } from './core/constants.js';
