import { BaseTool } from './base-tool.js';
import type { ToolTag, ToolResult } from './base-tool.js';
import { ToolArgumentType } from './types.js';
import { toolRegistry } from './registry.js';
import { recallProfile, writeProfile } from './memory/index.js';
import type { MemoryContextGraph } from './memory/index.js';
import { getLogger } from './logger.js';
const logger = getLogger();

@toolRegistry.register({ name: 'memory_tool' })
export class MemoryTool extends BaseTool {
  static readonly toolTag: ToolTag = {
    name: 'memory_tool',
    labelName: 'User Profile Memory',
    isSpecialized: false,
    mcpExposable: true,
    actionchainMainKey: null,
    description: 'Recall or write user profile entries (summary, topics, tags, preferences) from long-term memory. Mode: recall|write. In recall mode, searches profile entries by relevance; in write mode, stores a new entry.',
    parameters: {
      mode: { type: ToolArgumentType.STR, required: true, description: "Operation mode: 'recall' or 'write'" },
      query: { type: ToolArgumentType.STR, required: false, description: 'In recall mode, used to search user profile entries by relevance; in write mode, stored as a new profile entry.' },
    },
  };

  static async run(
    dispatcher: unknown,
    _event: unknown,
    mode?: string,
    query?: string,
  ): Promise<ToolResult> {
    if (!mode) return { success: false, error: 'mode parameter is required' };

    const d = dispatcher as {
      request: {
        requester: {
          memory?: () => Promise<{ graph: MemoryContextGraph; save(): Promise<void> }>;
        };
      };
    };

    if (typeof d.request.requester.memory !== 'function') {
      return { success: false, user_preferences: [], error: 'No memory available for this user' };
    }

    try {
      const mem = await d.request.requester.memory();

      if (mode === 'recall') {
        const entries = recallProfile(mem.graph, query || undefined);
        const prefs = entries.map((e) => JSON.stringify(e));
        logger.info(`MemoryTool recall: ${prefs.length} entries`);
        return { success: true, user_preferences: prefs };
      }

      if (mode === 'write') {
        const text = query?.trim();
        if (text) {
          writeProfile(mem.graph, text, { category: 'preference', source: 'react_agent' });
          await mem.save();
          logger.info(`MemoryTool write: stored entry`);
          return { success: true, user_preferences: [text] };
        }
        return { success: true, user_preferences: [] };
      }

      return { success: false, user_preferences: [], error: `Unknown mode: ${mode}` };
    } catch (err) {
      logger.error({ msg: 'MemoryTool error', err });
      return { success: false, user_preferences: [], error: String(err) };
    }
  }
}
