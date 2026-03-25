import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BaseTool, type ToolTag, type ToolResult } from '../base-tool.js';
import { mcpSchemaToToolParameters } from './schema-adapter.js';
import type { McpServerConfig, McpToolOverride } from '../config.js';
import { getLogger } from '../logger.js';

const logger = getLogger();

export class McpToolProxy {
  private clients = new Map<string, Client>();

  async connectServers(serverConfigs: McpServerConfig[]): Promise<Map<string, typeof BaseTool>> {
    const syntheticTools = new Map<string, typeof BaseTool>();

    for (const serverConfig of serverConfigs) {
      try {
        const transport = this.createTransport(serverConfig);
        if (!transport) continue;

        const client = new Client({ name: 'olow-engine', version: '1.0.0' });
        await client.connect(transport);
        this.clients.set(serverConfig.name, client);
        logger.info(`Connected to MCP server: ${serverConfig.name}`);

        const { tools } = await client.listTools();
        for (const mcpTool of tools) {
          const toolName = `mcp_${serverConfig.name}_${mcpTool.name}`;
          const override = serverConfig.toolOverrides?.[mcpTool.name];
          syntheticTools.set(toolName, this.createToolClass(toolName, mcpTool, client, override));
          logger.info(`Registered MCP tool: ${toolName}`);
        }
      } catch (err) {
        logger.warn({ msg: `Failed to connect MCP server "${serverConfig.name}" (non-fatal)`, err });
      }
    }

    return syntheticTools;
  }

  private createTransport(cfg: McpServerConfig): InstanceType<typeof StdioClientTransport> | InstanceType<typeof SSEClientTransport> | InstanceType<typeof StreamableHTTPClientTransport> | null {
    switch (cfg.transport) {
      case 'stdio':
        if (!cfg.command) { logger.warn(`MCP server "${cfg.name}": stdio requires 'command'`); return null; }
        return new StdioClientTransport({ command: cfg.command, args: cfg.args, env: cfg.env as Record<string, string> | undefined });
      case 'sse':
        if (!cfg.url) { logger.warn(`MCP server "${cfg.name}": sse requires 'url'`); return null; }
        return new SSEClientTransport(new URL(cfg.url));
      case 'streamable-http':
        if (!cfg.url) { logger.warn(`MCP server "${cfg.name}": streamable-http requires 'url'`); return null; }
        return new StreamableHTTPClientTransport(new URL(cfg.url));
      default:
        logger.warn(`MCP server "${cfg.name}": unknown transport "${cfg.transport}"`);
        return null;
    }
  }

  private createToolClass(
    toolName: string,
    mcpTool: { name: string; description?: string; inputSchema?: Record<string, unknown> },
    client: Client,
    override?: McpToolOverride,
  ): typeof BaseTool {
    const parameters = mcpSchemaToToolParameters(mcpTool.inputSchema);
    const mcpToolName = mcpTool.name;

    const tag: ToolTag = {
      name: toolName,
      labelName: mcpTool.name,
      isSpecialized: override?.isSpecialized ?? false,
      mcpExposable: false,
      actionchainMainKey: null,
      description: mcpTool.description ?? '',
      parameters,
      ...(override?.intentHints ? { intentHints: override.intentHints } : {}),
    };

    const toolClass = class McpProxyTool extends BaseTool {
      static readonly toolTag: ToolTag = tag;

      static async run(_dispatcher: unknown, _event: unknown, ...args: unknown[]): Promise<ToolResult> {
        try {
          const namedArgs: Record<string, unknown> = {};
          const paramNames = Object.keys(parameters);
          for (let i = 0; i < paramNames.length; i++) {
            if (args[i] !== undefined) namedArgs[paramNames[i]!] = args[i];
          }

          const result = await client.callTool({ name: mcpToolName, arguments: namedArgs });

          let data: unknown;
          if (Array.isArray(result.content)) {
            const textParts = result.content
              .filter((c): c is { type: 'text'; text: string } => (c as Record<string, unknown>)['type'] === 'text')
              .map((c) => c.text);
            data = textParts.length === 1 ? textParts[0] : textParts.join('\n');
          } else {
            data = result.content;
          }

          return { success: !result.isError, data, error: result.isError ? String(data) : undefined };
        } catch (err) {
          return { success: false, error: `MCP tool call failed: ${String(err)}` };
        }
      }
    };

    Object.defineProperty(toolClass, 'name', { value: `McpTool_${mcpTool.name}` });
    return toolClass;
  }

  async shutdown(): Promise<void> {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
        logger.info(`Disconnected MCP server: ${name}`);
      } catch (err) {
        logger.warn({ msg: `Error disconnecting MCP server "${name}"`, err });
      }
    }
    this.clients.clear();
  }
}
