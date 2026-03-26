import { getLogger } from '@olow/engine';
const logger = getLogger();

// MCP Server — exposes local tools to external MCP clients
// TODO: Implement using @modelcontextprotocol/sdk

export function initialize(_opts: {
  getBroker: () => unknown;
  toolsMap: Map<string, unknown>;
}): void {
  logger.info('MCP Server initialized (stub)');
}
