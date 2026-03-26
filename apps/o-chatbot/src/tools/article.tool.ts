import {
  BaseTool, toolRegistry, getLogger,
  ToolArgumentType,
} from '@olow/engine';
import type { ToolTag, ToolResult } from '@olow/engine';
import { config } from '../config/index.js';
import { embeddingSearch } from '../services/hyaide.api.js';

const logger = getLogger();

@toolRegistry.register({ name: 'article_tool' })
export class ArticleTool extends BaseTool {
  static readonly toolTag: ToolTag = {
    name: 'article_tool',
    labelName: 'Article Search',
    isSpecialized: false,
    mcpExposable: true,
    actionchainMainKey: null,
    description: 'Search articles for in-depth information on IT topics',
    parameters: {
      query: { type: ToolArgumentType.STR, required: true, description: 'Search query string' },
      top_k: { type: ToolArgumentType.INT, required: false, description: 'Number of results (default: 3)' },
    },
  };

  static async run(
    _dispatcher: unknown,
    _event: unknown,
    query?: string,
    top_k?: unknown,
  ): Promise<ToolResult> {
    if (!query) return { success: false, error: 'query parameter is required' };
    const topK = parseInt(String(top_k ?? '3'), 10) || 3;
    const agentId = config.hyaide.article_agent_id;

    if (!agentId) {
      return { success: true, articles: [], count: 0 };
    }

    try {
      const token = config.hyaide.token;
      const raw = await embeddingSearch(token, query, agentId);

      const articles = raw.slice(0, topK).map((r) => ({
        title: r.index || 'N/A',
        summary: r.value.slice(0, 500),
        url: r.url ?? '',
        confidence: parseFloat(r.confidence),
      }));

      return { success: true, articles, count: articles.length };
    } catch (err) {
      logger.error({ msg: 'ArticleTool error', err });
      return { success: false, error: String(err) };
    }
  }
}
