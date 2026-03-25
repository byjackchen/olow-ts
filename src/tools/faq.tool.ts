import { BaseTool, type ToolTag, type ToolResult } from './base.tool.js';
import { ToolArgumentType } from '../engine/types.js';
import logger from '../engine/logger.js';
import * as mongo from '../storage/mongo.js';
import { toolRegistry } from '../engine/registry.js';

@toolRegistry.register({ name: 'faq_tool' })
export class FaqTool extends BaseTool {
  static readonly toolTag: ToolTag = {
    name: 'faq_tool',
    labelName: 'FAQ Search',
    isSpecialized: false,
    mcpExposable: true,
    actionchainMainKey: null,
    description: 'Search the FAQ knowledge base for answers to user questions',
    parameters: {
      query: { type: ToolArgumentType.STR, required: true, description: 'Search query string' },
      top_k: { type: ToolArgumentType.STR, required: false, description: 'Number of results to return (default: 5)' },
    },
  };

  static async run(
    dispatcher: any,
    _event: unknown,
    query?: string,
    top_k?: string,
  ): Promise<ToolResult> {
    if (!query) return { success: false, error: 'query parameter is required' };
    const topKInt = parseInt(top_k ?? '5', 10) || 5;

    try {
      // Search FAQs in database using text matching
      const allFaqs = await mongo.getAllFaqs();

      // Simple keyword matching (Hyaide embedding search would be used in production)
      const queryLower = query.toLowerCase();
      const scored = allFaqs
        .map((faq) => {
          const question = ((faq['standard_question'] as string) ?? '').toLowerCase();
          const altQuestions = (faq['alternative_questions'] as string[]) ?? [];

          // Score: exact substring match > partial match
          let score = 0;
          if (question.includes(queryLower)) score = 1.0;
          else if (queryLower.includes(question)) score = 0.8;
          else {
            for (const alt of altQuestions) {
              if (alt.toLowerCase().includes(queryLower)) { score = 0.7; break; }
            }
          }

          return { faq, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topKInt);

      const results = scored.map((r) => {
        const answers = (r.faq['answers'] as Array<Record<string, unknown>>) ?? [];
        const answer = answers[0]?.['text'] ?? answers[0]?.['content'] ?? '';
        return {
          faq_title: r.faq['standard_question'] as string,
          faq_hash: r.faq['id'] as string,
          faq_answer: String(answer),
          faq_similarity: r.score,
        };
      });

      return { success: true, faqs: results, count: results.length };
    } catch (err) {
      logger.error({ msg: 'FaqTool error', err });
      return { success: false, error: String(err) };
    }
  }
}
