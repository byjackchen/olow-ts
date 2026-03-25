import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { BaseTool, type ToolTag, type ToolResult } from '../base-tool.js';
import { mcpSchemaToToolParameters } from './schema-adapter.js';
import type { McpServerConfig } from '../config.js';
import { getLogger } from '../logger.js';
const logger = getLogger();

// ─── McpToolProxy ───

export class McpToolProxy {
  private clients = new Map<string, Client>();

  async connectServers(serverConfigs: McpServerConfig[]): Promise<Map<string, typeof BaseTool>> {
    const syntheticTools = new Map<string, typeof BaseTool>();

    for (const serverConfig of serverConfigs) {
      try {
        const client = new Client(
          { name: 'olow-engine', version: '1.0.0' },
          { capabilities: {} },
        );

        let transport;
        if (serverConfig.transport === 'stdio') {
          if (!serverConfig.command) {
            logger.warn(`MCP server "${serverConfig.name}": stdio transport requires 'command'`);
            continue;
          }
          transport = new StdioClientTransport({
            command: serverConfig.command,
            args: serverConfig.args,
            env: serverConfig.env as Record<string, string> | undefined,
          });
        } else if (serverConfig.transport === 'sse') {
          if (!serverConfig.url) {
            logger.warn(`MCP server "${serverConfig.name}": sse transport requires 'url'`);
            continue;
          }
          transport = new SSEClientTransport(new URL(serverConfig.url));
        } else {
          logger.warn(`MCP server "${serverConfig.name}": unknown transport "${serverConfig.transport}"`);
          continue;
        }

        await client.connect(transport);
        this.clients.set(serverConfig.name, client);
        logger.info(`Connected to MCP server: ${serverConfig.name}`);

        // List tools from server
        const { tools } = await client.listTools();

        for (const mcpTool of tools) {
          const toolClass = this.createSyntheticToolClass(serverConfig.name, mcpTool, client);
          const toolName = `mcp_${serverConfig.name}_${mcpTool.name}`;
          syntheticTools.set(toolName, toolClass);
          logger.info(`Registered MCP tool: ${toolName}`);
        }
      } catch (err) {
        logger.warn({ msg: `Failed to connect MCP server "${serverConfig.name}" (non-fatal)`, err });
      }
    }

    return syntheticTools;
  }

  private createSyntheticToolClass(
    serverName: string,
    mcpTool: { name: string; description?: string; inputSchema?: Record<string, unknown> },
    client: Client,
  ): typeof BaseTool {
    const parameters = mcpSchemaToToolParameters(mcpTool.inputSchema);
    const toolName = `mcp_${serverName}_${mcpTool.name}`;
    const mcpToolName = mcpTool.name;

    const tag: ToolTag = {
      name: toolName,
      labelName: mcpTool.name,
      isSpecialized: false,
      mcpExposable: false,
      actionchainMainKey: null,
      description: mcpTool.description ?? '',
      parameters,
    };

    // Create a dynamic class that extends BaseTool
    const toolClass = class McpProxyTool extends BaseTool {
      static readonly toolTag: ToolTag = tag;

      static async run(
        _dispatcher: unknown,
        _event: unknown,
        ...args: unknown[]
      ): Promise<ToolResult> {
        try {
          // Map positional args to named params based on toolTag.parameters
          const namedArgs: Record<string, unknown> = {};
          const paramNames = Object.keys(parameters);
          for (let i = 0; i < paramNames.length; i++) {
            if (args[i] !== undefined) namedArgs[paramNames[i]!] = args[i];
          }

          const result = await client.callTool({
            name: mcpToolName,
            arguments: namedArgs,
          });

          // Extract text content from MCP result
          let data: unknown;
          if (Array.isArray(result.content)) {
            const textParts = result.content
              .filter((c): c is { type: 'text'; text: string } => (c as Record<string, unknown>)['type'] === 'text')
              .map((c) => c.text);
            data = textParts.length === 1 ? textParts[0] : textParts.join('\n');
          } else {
            data = result.content;
          }

          return {
            success: !result.isError,
            data,
            error: result.isError ? String(data) : undefined,
          };
        } catch (err) {
          return {
            success: false,
            error: `MCP tool call failed: ${String(err)}`,
          };
        }
      }
    };

    // Set a descriptive class name
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
