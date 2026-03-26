import {
  BaseTool, toolRegistry, getLogger,
  ToolArgumentType,
} from '@olow/engine';
import type { ToolTag, ToolResult } from '@olow/engine';
const logger = getLogger();
import * as servicenowApi from '../services/servicenow.api.js';

@toolRegistry.register({ name: 'get_hardware_asset' })
export class HardwareAssetTool extends BaseTool {
  static readonly toolTag: ToolTag = {
    name: 'get_hardware_asset',
    labelName: 'Hardware Asset Lookup',
    isSpecialized: false,
    mcpExposable: true,
    actionchainMainKey: null,
    description: 'Look up hardware assets assigned to a user',
    parameters: {
      user_id: { type: ToolArgumentType.STR, required: true, description: 'The user RTX/ID to look up assets for' },
    },
  };

  static async run(
    _dispatcher: unknown,
    _event: unknown,
    user_id?: string,
  ): Promise<ToolResult> {
    if (!user_id) return { success: false, error: 'user_id is required' };

    try {
      const assets = await servicenowApi.getHardwareAssets(user_id);
      return {
        success: true,
        data: assets.map((a) => ({
          display_name: a['display_name'],
          model_category: a['model_category'],
          serial_number: a['serial_number'],
          assigned_date: a['u_first_assigned_date'],
        })),
        count: assets.length,
      };
    } catch (err) {
      logger.error({ msg: 'HardwareAssetTool error', err });
      return { success: false, error: String(err) };
    }
  }
}
