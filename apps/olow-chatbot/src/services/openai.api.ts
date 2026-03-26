import { config } from '../config/index.js';
import { getLogger } from '@olow/engine';
const logger = getLogger();

// ─── Types ───

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionChoice {
  index: number;
  message: { role: string; content: string };
  finish_reason: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: ChatCompletionChoice[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ─── Model Resolution ───

function resolveModel(modelKey: string): { name: string; maxCompletionTokens?: number } {
  const openaiConfig = config.openai as Record<string, unknown>;
  const modelConfig = openaiConfig[modelKey] as { name: string; max_completion_tokens?: number } | undefined;
  if (!modelConfig) {
    return { name: modelKey }; // Treat as direct model name
  }
  return { name: modelConfig.name, maxCompletionTokens: modelConfig.max_completion_tokens };
}

// ─── Chat Completions ───

export async function callChatCompletions(
  userMsg: string,
  opts?: {
    model?: string;
    systemMsg?: string;
    messages?: ChatMessage[];
    jsonMode?: boolean;
    maxTokens?: number;
    tools?: unknown[];
  },
): Promise<ChatCompletionResponse> {
  const modelKey = opts?.model ?? config.engine.base_llm_model;
  const { name: modelName, maxCompletionTokens } = resolveModel(modelKey);

  const messages: ChatMessage[] = opts?.messages ?? [
    ...(opts?.systemMsg ? [{ role: 'system' as const, content: opts.systemMsg }] : []),
    { role: 'user', content: userMsg },
  ];

  const body: Record<string, unknown> = {
    model: modelName,
    messages,
    max_completion_tokens: opts?.maxTokens ?? maxCompletionTokens ?? 10000,
  };

  if (opts?.jsonMode) {
    body['response_format'] = { type: 'json_object' };
  }
  if (opts?.tools) {
    body['tools'] = opts.tools;
  }

  const resp = await fetch(`${config.openai.api_domain}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.api_key}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${text}`);
  }

  return (await resp.json()) as ChatCompletionResponse;
}

// ─── Streaming Chat Completions ───

export async function* streamChatCompletions(
  userMsg: string,
  opts?: {
    model?: string;
    systemMsg?: string;
    messages?: ChatMessage[];
    maxTokens?: number;
  },
): AsyncGenerator<[type: 'reasoning' | 'content' | 'done', token: string]> {
  const modelKey = opts?.model ?? config.engine.base_llm_model;
  const { name: modelName, maxCompletionTokens } = resolveModel(modelKey);

  const messages: ChatMessage[] = opts?.messages ?? [
    ...(opts?.systemMsg ? [{ role: 'system' as const, content: opts.systemMsg }] : []),
    { role: 'user', content: userMsg },
  ];

  const body: Record<string, unknown> = {
    model: modelName,
    messages,
    stream: true,
    max_completion_tokens: opts?.maxTokens ?? maxCompletionTokens ?? 10000,
  };

  const resp = await fetch(`${config.openai.api_domain}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.api_key}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI streaming API error ${resp.status}: ${text}`);
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

        // Handle reasoning tokens (DeepSeek / o1-style)
        const reasoning = delta['reasoning_content'] as string | undefined;
        if (reasoning) {
          yield ['reasoning', reasoning];
        }

        const content = delta['content'] as string | undefined;
        if (content) {
          yield ['content', content];
        }
      } catch {
        logger.warn({ msg: 'Failed to parse SSE chunk', data });
      }
    }
  }

  yield ['done', ''];
}
