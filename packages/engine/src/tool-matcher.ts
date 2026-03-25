import type { ToolTag } from './base-tool.js';

// ─── BM25 Tool Matcher ───
// Ranks specialized tools against a query using BM25 scoring.
// Zero external dependencies — operates on intentHints + description.

interface ScoredTool {
  name: string;
  score: number;
}

// BM25 parameters
const K1 = 1.2;
const B = 0.75;

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(Boolean);
}

export function matchTools(
  query: string,
  tools: Array<{ toolTag: ToolTag }>,
  threshold: number,
): ScoredTool[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Build corpus: one "document" per tool from intentHints + description
  const docs = tools.map((t) => {
    const parts = [...(t.toolTag.intentHints ?? []), t.toolTag.description];
    return tokenize(parts.join(' '));
  });

  // Average document length
  const avgDl = docs.reduce((sum, d) => sum + d.length, 0) / (docs.length || 1);

  // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
  const N = docs.length;
  const df = new Map<string, number>();
  for (const doc of docs) {
    const seen = new Set(doc);
    for (const term of seen) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  // Score each tool
  const scored: ScoredTool[] = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;
    const dl = doc.length;

    // Term frequency in this doc
    const tf = new Map<string, number>();
    for (const term of doc) {
      tf.set(term, (tf.get(term) ?? 0) + 1);
    }

    let score = 0;
    for (const term of queryTokens) {
      const termDf = df.get(term) ?? 0;
      const termTf = tf.get(term) ?? 0;
      if (termTf === 0) continue;

      const idf = Math.log((N - termDf + 0.5) / (termDf + 0.5) + 1);
      const tfNorm = (termTf * (K1 + 1)) / (termTf + K1 * (1 - B + B * (dl / avgDl)));
      score += idf * tfNorm;
    }

    if (score >= threshold) {
      scored.push({ name: tools[i]!.toolTag.name, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}
