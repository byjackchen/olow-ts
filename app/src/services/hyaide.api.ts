import { config } from '../config/index.js';
import { getLogger } from '@olow/engine';
const logger = getLogger();

// Hyaide LLM API client (DeepSeek, Qwen models via Tencent Hyaide platform)

export interface HyaideLlmResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

export async function callHyaideLlm(
  apiToken: string,
  userMsg: string,
  model: string,
): Promise<HyaideLlmResponse> {
  const modelConfig = (config.hyaide as Record<string, unknown>)[model] as { name: string; max_tokens: number } | undefined;
  const modelName = modelConfig?.name ?? model;
  const llmUrl = `${config.hyaide.llm_url || config.hyaide.url}/openapi/chat/completions`;

  const resp = await fetch(llmUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: userMsg }],
      stream: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Hyaide API error ${resp.status}: ${text}`);
  }

  return (await resp.json()) as HyaideLlmResponse;
}

export async function* streamHyaideLlm(
  apiToken: string,
  userMsg: string,
  model: string,
): AsyncGenerator<[type: 'reasoning' | 'content' | 'done', token: string]> {
  const modelConfig = (config.hyaide as Record<string, unknown>)[model] as { name: string; max_tokens: number } | undefined;
  const modelName = modelConfig?.name ?? model;
  const llmUrl = `${config.hyaide.llm_url || config.hyaide.url}/openapi/chat/completions`;

  const resp = await fetch(llmUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiToken,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: userMsg }],
      max_tokens: modelConfig?.max_tokens ?? 32000,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Hyaide streaming API error ${resp.status}: ${text}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response body for streaming');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') {
        yield ['done', ''];
        return;
      }

      try {
        const chunk = JSON.parse(data) as Record<string, unknown>;
        const choices = chunk['choices'] as Array<Record<string, unknown>> | undefined;
        if (!choices?.[0]) continue;

        const delta = choices[0]['delta'] as Record<string, unknown> | undefined;
        if (!delta) continue;

        const reasoning = delta['reasoning_content'] as string | undefined;
        if (reasoning) yield ['reasoning', reasoning];

        const content = delta['content'] as string | undefined;
        if (content) yield ['content', content];
      } catch {
        // Skip malformed chunks
      }
    }
  }

  yield ['done', ''];
}

// ─── Embedding Search ───

export interface EmbeddingSearchResult {
  index: string;
  value: string;
  metric: number;
  confidence: string;
  url?: string;
}

export async function embeddingSearch(apiToken: string, query: string, agentId: string): Promise<EmbeddingSearchResult[]> {
  const resp = await callAgentConcise(apiToken, query, agentId);
  const indexResults = resp.global_output['index_results'] as unknown[] | undefined;
  if (!indexResults) {
    throw new Error('Hyaide embedding search: missing index_results in response');
  }
  const results = indexResults[0];
  if (!Array.isArray(results)) return [];

  return (results as Array<Record<string, unknown>>).map((r) => ({
    index: (r['index'] as string) ?? '',
    value: (r['value'] as string) ?? '',
    metric: Number(r['metric'] ?? 0),
    confidence: String(Math.round((1 - Math.abs(Number(r['metric'] ?? 0))) * 10000) / 10000),
    url: r['url'] as string | undefined,
  }));
}

// ─── Agent Concise ───

export async function callAgentConcise(
  apiToken: string,
  query: string,
  agentId: string,
): Promise<{ global_output: Record<string, unknown> }> {
  const url = config.hyaide.url;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiToken,
    },
    body: JSON.stringify({
      query,
      messages: [
        { role: 'system', content: '' },
        { role: 'user', content: query },
      ],
      forward_service: agentId,
      query_id: `qid-${Date.now()}`,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Hyaide agent API error ${resp.status}: ${text}`);
  }

  return (await resp.json()) as { global_output: Record<string, unknown> };
}
