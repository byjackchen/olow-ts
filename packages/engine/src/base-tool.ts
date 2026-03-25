import type { ToolArgumentType } from './types.js';

export interface ToolParameter {
  type: ToolArgumentType;
  required: boolean;
  description: string;
}

export interface ToolTag {
  name: string;
  labelName: string;
  isSpecialized: boolean;
  mcpExposable: boolean;
  actionchainMainKey: string | null;
  description: string;
  parameters: Record<string, ToolParameter>;
  intentHints?: string[];
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  [key: string]: unknown;
}

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
