import type { ToolTag } from '../tools/base.tool.js';

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
