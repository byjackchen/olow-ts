import type { ToolTag, ToolResult } from '@olow/types';

// Re-export interfaces from @olow/types
export type { ToolParameter, ToolTag, ToolResult } from '@olow/types';

export abstract class BaseTool {
  static readonly toolTag: ToolTag;

  static async run(
    _dispatcher: unknown,
    _event: unknown,
    ..._args: unknown[]
  ): Promise<ToolResult> {
    throw new Error('run() must be implemented by subclass');
  }
}
