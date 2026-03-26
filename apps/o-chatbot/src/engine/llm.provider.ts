// ─── LLM Provider (implements ILlmProvider) ───

import { config } from '../config/index.js';
import { getLogger, StructuralStreamParser, Section } from '@olow/engine';
import type { ILlmProvider } from '@olow/engine';
import * as openaiApi from '../services/openai.api.js';
import { callHyaideLlm } from '../services/hyaide.api.js';

const logger = getLogger();

export class LlmProvider implements ILlmProvider {
  constructor(private readonly getRotatedToken: () => string) {}

  async callLlm(
    message: string,
    opts?: { jsonMode?: 'string' | 'json' | 'json_fence'; provider?: string; model?: string },
  ): Promise<[success: boolean, result: string | Record<string, unknown> | null]> {
    const provider = opts?.provider ?? config.engine.base_llm_provider;
    const model = opts?.model ?? config.engine.base_llm_model;
    const jsonMode = opts?.jsonMode ?? 'string';

    let respStr: string;
    if (provider === 'openai') {
      const resp = await openaiApi.callChatCompletions(message, { model });
      respStr = resp.choices[0]?.message.content ?? '';
    } else if (provider === 'hyaide') {
      const token = this.getRotatedToken();
      const resp = await callHyaideLlm(token, message, model);
      respStr = resp.choices[0]?.message.content ?? '';
    } else {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    return parseLlmResponse(respStr, jsonMode);
  }

  async callLlmStream(
    message: string,
    msgQueue: { put: (msg: unknown) => Promise<void> },
    opts?: { jsonMode?: 'string' | 'json' | 'json_fence'; provider?: string; model?: string },
  ): Promise<[success: boolean, result: string | Record<string, unknown> | null]> {
    const provider = opts?.provider ?? config.engine.base_llm_provider;
    const model = opts?.model ?? config.engine.base_llm_model;
    const jsonMode = opts?.jsonMode ?? 'string';

    const fullTokens: string[] = [];
    const parser = new StructuralStreamParser();
    let lastEmitted: string | null = null;

    const emit = async (msgType: string, delta: string, isComplete: boolean) => {
      if (!isComplete && lastEmitted && lastEmitted !== msgType) {
        await msgQueue.put({ messageType: lastEmitted, delta: '', isComplete: true });
      }
      lastEmitted = isComplete ? null : msgType;
      await msgQueue.put({ messageType: msgType, delta, isComplete });
    };

    // Reasoning field extractor — detects "thought": " in streaming JSON
    let contentBuf = '';
    const REASONING_START = '"thought":';
    let inReasoning = false;

    const flushContentToken = async (token: string) => {
      contentBuf += token;

      if (!inReasoning) {
        const idx = contentBuf.indexOf(REASONING_START);
        if (idx === -1) return;
        let rest = contentBuf.slice(idx + REASONING_START.length).trimStart();
        if (!rest.startsWith('"')) return;
        rest = rest.slice(1);
        inReasoning = true;
        contentBuf = rest;
      }

      if (inReasoning) {
        let i = 0;
        while (i < contentBuf.length) {
          if (contentBuf[i] === '\\' && i + 1 < contentBuf.length) {
            const escaped = contentBuf[i + 1];
            const actual = escaped === 'n' ? '\n' : escaped === 't' ? '\t' : (escaped ?? '');
            await emit('think_l3', actual, false);
            i += 2;
          } else if (contentBuf[i] === '"') {
            inReasoning = false;
            await emit('think_l3', '', true);
            contentBuf = '';
            return;
          } else {
            await emit('think_l3', contentBuf[i]!, false);
            i++;
          }
        }
        contentBuf = '';
      }
    };

    let streamGen: AsyncGenerator<[type: 'reasoning' | 'content' | 'done', token: string]>;
    if (provider === 'openai') {
      streamGen = openaiApi.streamChatCompletions(message, { model });
    } else if (provider === 'hyaide') {
      const token = this.getRotatedToken();
      const { streamHyaideLlm } = await import('../services/hyaide.api.js');
      streamGen = streamHyaideLlm(token, message, model);
    } else {
      throw new Error(`Streaming not implemented for provider: ${provider}`);
    }

    for await (const [type, token] of streamGen) {
      if (type === 'done') {
        if (lastEmitted) await emit(lastEmitted, '', true);
        break;
      }
      if (type === 'reasoning') {
        await emit('think_l2', token, false);
        continue;
      }
      if (type === 'content') {
        fullTokens.push(token);
        const results = parser.feed(token);
        let hasStructural = false;
        for (const [section, text] of results) {
          if (section === Section.THINK_L3) {
            hasStructural = true;
            await emit('think_l3', text, false);
          } else if (section === Section.ANSWER) {
            await flushContentToken(text);
          }
        }
        if (!hasStructural && results.length === 0) {
          await flushContentToken(token);
        }
      }
    }

    const fullText = fullTokens.join('');
    return parseLlmResponse(fullText, jsonMode);
  }
}

function parseLlmResponse(
  text: string,
  jsonMode: 'string' | 'json' | 'json_fence',
): [boolean, string | Record<string, unknown> | null] {
  if (jsonMode === 'string') return [true, text];

  let candidate = text;
  if (jsonMode === 'json_fence') {
    const fencePattern = /```(?:json|jsonc)?\s*([\[{](?:(?!```)[\s\S])*?[}\]])\s*```/i;
    const match = fencePattern.exec(text);
    candidate = match?.[1] ?? text;
  }

  try {
    return [true, JSON.parse(candidate) as Record<string, unknown>];
  } catch {
    logger.error({ msg: 'Failed to parse JSON from LLM response', text: candidate.slice(0, 200) });
    return [false, null];
  }
}
