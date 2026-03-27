import {
  BaseFlow, Event, flowRegistry, getLogger,
  CoreEventType, EventStatus, FlowMsgType, matchTools,
  getSessionContent,
} from '@olow/engine';
import type { MessengerType, ToolTag } from '@olow/engine';
import { ReactEventType } from './events.js';
import { getReactAgentConfig } from './config.js';
import { getReactTemplateProvider } from './templates.js';
import { reactIntentPrompt } from './prompts.js';

const logger = getLogger();

@flowRegistry.register()
export class ReactIntentFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === ReactEventType.REACT_INTENT;
  }

  async run(): Promise<EventStatus> {
    const tpl = getReactTemplateProvider();
    const cfg = getReactAgentConfig();
    const mode = cfg.intent_mode.replace(/_/g, '-').toLowerCase();
    const content = this.request.content.mixedText;

    if (!this.dispatcher.states.react.process_chain) {
      this.dispatcher.states.react.process_chain = [];
    }

    await this.event.propagateMsg(
      tpl.idle(tpl.i18n.INTENT()), undefined, undefined, FlowMsgType.THINK_L1,
    );

    const chatHistory = await this.extractChatHistory();

    if (mode === 'single-rewritten') {
      await this.handleSingleRewritten(content, chatHistory);
    } else {
      this.handleMultiTurns(content, chatHistory);
    }

    this.buildAvailableTools(content);
    this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_PRECALL));
    return EventStatus.COMPLETE;
  }

  private async extractChatHistory(): Promise<string> {
    const { requester } = this.request;
    if (!('memory' in requester) || !requester.memory) return '';

    try {
      const mem = await requester.memory();
      const sessionId = this.request.sessionId ?? 'default';
      return getSessionContent(mem.graph, sessionId).join('\n');
    } catch {
      return '';
    }
  }

  private async handleSingleRewritten(content: string, chatHistory: string): Promise<void> {
    const chain = this.dispatcher.states.react.process_chain;

    try {
      const [success, result] = await this.broker.llm.callLlm(
        reactIntentPrompt(
          chatHistory
            ? [...chatHistory.split('\n').map((h) => ({ role: 'user', content: h })), { role: 'user', content: content }]
            : [{ role: 'user', content: content }],
          this.request.language ?? 'en',
        ),
        { jsonMode: 'json_fence' },
      );

      if (success && result && typeof result === 'object') {
        const parsed = result as Record<string, unknown>;
        const rewritten = (parsed['rewritten_query'] as string) ?? (parsed['rewritten_question'] as string) ?? content;
        chain.push({ type: 'question', question: rewritten, original: content });

        if (parsed['is_relevant'] === false) {
          this.dispatcher.eventchain.push(new Event(CoreEventType.ANALYSIS));
        }
      } else {
        chain.push({ type: 'question', question: content });
      }
    } catch (err) {
      logger.error({ msg: 'Intent rewrite LLM call failed', err });
      chain.push({ type: 'question', question: content });
    }
  }

  private handleMultiTurns(content: string, chatHistory: string): void {
    const chain = this.dispatcher.states.react.process_chain;

    if (chatHistory) {
      chain.push({ type: 'histories', histories: chatHistory });
    }
    chain.push({ type: 'question', question: content });
  }

  private buildAvailableTools(query: string): void {
    const cfg = getReactAgentConfig();
    const toEntry = (tag: ToolTag) => ({
      name: tag.name, description: tag.description, parameters: tag.parameters,
    });
    const general: Array<{ name: string; description: string; parameters?: Record<string, unknown> }> = [];
    const specialized: Array<{ toolTag: ToolTag }> = [];

    for (const [, tool] of this.dispatcher.toolsMap) {
      if (!tool.toolTag) continue;
      if (tool.toolTag.isSpecialized) {
        specialized.push({ toolTag: tool.toolTag });
      } else {
        general.push(toEntry(tool.toolTag));
      }
    }

    // BM25 match specialized tools against query
    const matched = matchTools(query, specialized, cfg.specialized_score_threshold);
    for (const m of matched) {
      const tag = specialized.find((s) => s.toolTag.name === m.name)!.toolTag;
      general.push(toEntry(tag));
    }

    this.dispatcher.states.react.available_tools = general;
  }
}
