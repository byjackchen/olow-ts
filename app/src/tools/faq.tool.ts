import {
  BaseTool, toolRegistry, getLogger,
  ToolArgumentType, dedup,
} from '@olow/engine';
import type { ToolTag, ToolResult } from '@olow/engine';
import { config } from '../config/index.js';
import { embeddingSearch } from '../services/hyaide.api.js';
import * as mongo from '../storage/mongo.js';

const logger = getLogger();

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
      top_k: { type: ToolArgumentType.STR, required: false, description: 'Number of results (default: 5)' },
    },
  };

  static async run(
    dispatcher: unknown,
    _event: unknown,
    query?: string,
    top_k?: string,
  ): Promise<ToolResult> {
    if (!query) return { success: false, error: 'query parameter is required' };
    const topK = parseInt(top_k ?? '5', 10) || 5;
    const agentId = config.hyaide.faq_agent_id;

    // Fallback to local DB search if no embedding agent configured
    if (!agentId) {
      return FaqTool.localSearch(query, topK, dispatcher);
    }

    try {
      // 1. Embedding search via Hyaide
      const token = config.hyaide.token;
      const raw = await embeddingSearch(token, query, agentId);
      logger.info(`FAQ embedding search returned ${raw.length} results`);
      if (raw.length === 0) return { success: true, faqs: [], count: 0 };

      // 2. Parse results — extract question_hash from value field
      const parsed = raw
        .map((r) => {
          const parts = r.value.split('|***|');
          if (parts.length < 3) return null;
          return {
            confidence: parseFloat(r.confidence),
            question_hash: parts[1]!,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      // 3. Deduplicate by question_hash
      const unique = dedup(parsed, (r) => r.question_hash);

      // 4. Join with MongoDB for full FAQ details
      const hashes = unique.map((r) => r.question_hash);
      const dbFaqs = await mongo.getFaqsByIds(hashes);
      const lookup = new Map(dbFaqs.map((f) => [f['id'] as string, f]));

      const lang = (dispatcher as { request?: { language?: string } }).request?.language;
      const results = unique
        .filter((r) => lookup.has(r.question_hash))
        .map((r) => {
          const dbRow = lookup.get(r.question_hash)!;
          return {
            faq_title: dbRow['standard_question'] as string,
            faq_hash: r.question_hash,
            faq_answer: getFaqAnswer(dbRow, lang),
            faq_similarity: r.confidence,
          };
        })
        .slice(0, topK);

      return { success: true, faqs: results, count: results.length };
    } catch (err) {
      logger.error({ msg: 'FaqTool embedding search error', err });
      return { success: false, error: String(err) };
    }
  }

  private static async localSearch(query: string, topK: number, _dispatcher: unknown): Promise<ToolResult> {
    try {
      const allFaqs = await mongo.getAllFaqs();
      const queryLower = query.toLowerCase();

      const scored = allFaqs
        .map((faq) => {
          const question = ((faq['standard_question'] as string) ?? '').toLowerCase();
          let score = 0;
          if (question.includes(queryLower)) score = 1.0;
          else if (queryLower.includes(question)) score = 0.8;
          return { faq, score };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      const results = scored.map((r) => ({
        faq_title: r.faq['standard_question'] as string,
        faq_hash: r.faq['id'] as string,
        faq_answer: getFaqAnswer(r.faq, undefined),
        faq_similarity: r.score,
      }));

      return { success: true, faqs: results, count: results.length };
    } catch (err) {
      logger.error({ msg: 'FaqTool local search error', err });
      return { success: false, error: String(err) };
    }
  }
}

function getFaqAnswer(faq: Record<string, unknown>, lang?: string): string {
  const answers = (faq['answers'] as Array<Record<string, unknown>>) ?? [];
  if (lang) {
    const match = answers.find((a) => a['lang'] === lang);
    if (match) return (match['answer'] as string) ?? '';
  }
  return (answers[0]?.['answer'] as string) ?? (answers[0]?.['text'] as string) ?? '';
}
