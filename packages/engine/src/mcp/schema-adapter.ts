import type { ToolTag, ToolParameter } from '../base-tool.js';
import { ToolArgumentType } from '../types.js';

// Converts internal ToolTag format to MCP-compatible JSON Schema

export function toolTagToMcpSchema(tag: ToolTag): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, param] of Object.entries(tag.parameters)) {
    properties[name] = {
      type: param.type === 'integer' ? 'integer' : 'string',
      description: param.description,
    };
    if (param.required) required.push(name);
  }

  return {
    name: tag.name,
    description: tag.description,
    inputSchema: {
      type: 'object',
      properties,
      required,
    },
  };
}

// Converts MCP JSON Schema to internal ToolParameter format

export function mcpSchemaToToolParameters(
  inputSchema: Record<string, unknown> | undefined,
): Record<string, ToolParameter> {
  const parameters: Record<string, ToolParameter> = {};
  if (!inputSchema) return parameters;

  const properties = (inputSchema['properties'] as Record<string, Record<string, unknown>>) ?? {};
  const required = new Set((inputSchema['required'] as string[]) ?? []);

  for (const [name, prop] of Object.entries(properties)) {
    const jsonType = (prop['type'] as string) ?? 'string';
    let toolType: string;

    switch (jsonType) {
      case 'integer':
      case 'number':
        toolType = ToolArgumentType.INT;
        break;
      case 'array':
        toolType = ToolArgumentType.LIST;
        break;
      default:
        toolType = ToolArgumentType.STR;
    }

    parameters[name] = {
      type: toolType as typeof ToolArgumentType[keyof typeof ToolArgumentType],
      required: required.has(name),
      description: (prop['description'] as string) ?? '',
    };
  }

  return parameters;
}
