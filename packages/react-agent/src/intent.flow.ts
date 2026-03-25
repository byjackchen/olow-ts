import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { getReactAgentConfig } from './config.js';
import { getReactTemplateProvider } from './templates.js';
import { reactIntentPrompt } from './prompts.js';

const logger = getLogger();

@flowRegistry.register()
export class ReactIntentFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_INTENT;
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

    this.buildAvailableTools();
    this.dispatcher.eventchain.push(new Event(EventType.REACT_PRECALL));
    return EventStatus.COMPLETE;
  }

  private async extractChatHistory(): Promise<string> {
    if (!('memory' in this.request.requester)) return '';
    const requester = this.request.requester as { memory?: () => Promise<{ getOrCreateContextGraph: () => { memory: { nodes: Array<{ type: string; text: string }> } } }> };
    if (typeof requester.memory !== 'function') return '';

    try {
      const memory = await requester.memory();
      const graph = memory.getOrCreateContextGraph();
      return graph.memory.nodes
        .filter((n) => n.type === 'content' || n.type === 'rewrite')
        .map((n) => n.text)
        .join('\n');
    } catch {
      return '';
    }
  }

  private async handleSingleRewritten(content: string, chatHistory: string): Promise<void> {
    const chain = this.dispatcher.states.react.process_chain;

    try {
      const [success, result] = await this.broker.llm.callLlm(
        reactIntentPrompt(content, chatHistory || undefined),
        { jsonMode: 'json_fence' },
      );

      if (success && result && typeof result === 'object') {
        const parsed = result as Record<string, unknown>;
        const rewritten = (parsed['rewritten_question'] as string) ?? content;
        chain.push({ type: 'question', question: rewritten, original: content });

        if (parsed['is_relevant'] === false) {
          this.dispatcher.eventchain.push(new Event(EventType.ANALYSIS));
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

  private buildAvailableTools(): void {
    const tools: Record<string, unknown>[] = [];
    for (const [, tool] of this.dispatcher.toolsMap) {
      const t = tool as { toolTag?: { name: string; description: string; isSpecialized: boolean } };
      if (t.toolTag && !t.toolTag.isSpecialized) {
        tools.push({ name: t.toolTag.name, description: t.toolTag.description });
      }
    }
    this.dispatcher.states.react.available_tools = tools;
  }
}
