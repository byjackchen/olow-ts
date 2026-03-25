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

  const resp = await fetch(config.hyaide.url, {
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

  const resp = await fetch(config.hyaide.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: userMsg }],
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

export async function callAgentConcise(
  apiToken: string,
  query: string,
  agentId: string,
): Promise<{ global_output: Record<string, unknown> }> {
  const resp = await fetch(config.hyaide.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      agent_id: agentId,
      query,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Hyaide agent API error ${resp.status}: ${text}`);
  }

  return (await resp.json()) as { global_output: Record<string, unknown> };
}
