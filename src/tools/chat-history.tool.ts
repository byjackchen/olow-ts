import { BaseTool, type ToolTag, type ToolResult } from './base.tool.js';
import { ToolArgumentType } from '../engine/types.js';
import logger from '../engine/logger.js';
import * as mongo from '../storage/mongo.js';
import { registerTool } from '../engine/dispatcher.js';

export class ChatHistoryTool extends BaseTool {
  static readonly toolTag: ToolTag = {
    name: 'get_chat_history',
    labelName: 'Chat History',
    isSpecialized: false,
    mcpExposable: false,
    actionchainMainKey: null,
    description: 'Get the recent chat history for the current user',
    parameters: {
      user_id: { type: ToolArgumentType.STR, required: true, description: 'The user ID to get history for' },
    },
  };

  static async run(
    _dispatcher: unknown,
    _event: unknown,
    user_id?: string,
  ): Promise<ToolResult> {
    if (!user_id) return { success: false, error: 'user_id is required' };

    try {
      const cycles = await mongo.cyclesGetUserRecentCycles(user_id);
      const history = cycles.map((c) => ({
        action: c['request_action'],
        content: c['request_content'],
        time: c['request_time'],
      }));
      return { success: true, data: history, count: history.length };
    } catch (err) {
      logger.error({ msg: 'ChatHistoryTool error', err });
      return { success: false, error: String(err) };
    }
  }
}
registerTool('get_chat_history', ChatHistoryTool);
