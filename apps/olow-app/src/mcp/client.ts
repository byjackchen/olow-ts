import { getLogger } from '@olow/engine';
const logger = getLogger();

// MCP Client — consumes tools from external MCP servers
// TODO: Implement using @modelcontextprotocol/sdk

export async function initialize(_app: unknown): Promise<void> {
  logger.info('MCP Client initialized (stub)');
}

export async function shutdown(_app: unknown): Promise<void> {
  logger.info('MCP Client shut down (stub)');
}
