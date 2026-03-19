import logger from '../engine/logger.js';

// MCP Server — exposes local tools to external MCP clients
// TODO: Implement using @modelcontextprotocol/sdk

export function initialize(_opts: {
  getBroker: () => unknown;
  toolsMap: Map<string, unknown>;
}): void {
  logger.info('MCP Server initialized (stub)');
}
