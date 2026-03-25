import {
  BaseFlow, Event, Request, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import { reactIntentPrompt } from './prompts.js';
import type { MessengerType } from '@olow/engine';
import { getReactTemplateProvider } from './templates.js';
const logger = getLogger();

export interface ReactAgentConfig {
  intent_mode: string;
  max_rounds: number;
}

let _reactConfig: ReactAgentConfig = { intent_mode: 'multi-turns', max_rounds: 5 };

export function setReactAgentConfig(cfg: ReactAgentConfig): void {
  _reactConfig = cfg;
}

@flowRegistry.register()
export class ReactIntentFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_INTENT;
  }

  async run(): Promise<EventStatus> {
    const tpl = getReactTemplateProvider();
    const userId = this.request.requester.id;
    logger.info(`ReactIntentFlow analyzing intent for user ${userId}`);

    const mode = _reactConfig.intent_mode.replace(/_/g, '-').toLowerCase();
    const content = this.request.content.mixedText;

    if (!this.dispatcher.states.react.process_chain) {
      this.dispatcher.states.react.process_chain = [];
    }

    await this.event.propagateMsg(
      tpl.aiIdle(tpl.i18n.AI_INTENT()),
      undefined, undefined, FlowMsgType.THINK_L1,
    );

    if (mode === 'single-rewritten') {
      let chatHistory = '';
      if ('memory' in this.request.requester && typeof (this.request.requester as Record<string, unknown>)['memory'] === 'function') {
        try {
          const memory = await (this.request.requester as { memory: () => Promise<{ getOrCreateContextGraph: () => { memory: { nodes: Array<{ type: string; text: string }>; edges: unknown[] } } }> }).memory();
          const graphThread = memory.getOrCreateContextGraph();
          const contentNodes = graphThread.memory.nodes
            .filter((n: { type: string }) => n.type === 'content' || n.type === 'rewrite')
            .map((n: { text: string }) => n.text);
          chatHistory = contentNodes.join('\n');
        } catch { chatHistory = ''; }
      }

      try {
        const [success, result] = await this.broker.llm.callLlm(
          reactIntentPrompt(content, chatHistory || undefined),
          { jsonMode: 'json_fence' },
        );

        if (success && result && typeof result === 'object') {
          const parsed = result as Record<string, unknown>;
          const rewrittenQuestion = (parsed['rewritten_question'] as string) ?? content;
          const isRelevant = parsed['is_relevant'] !== false;

          this.dispatcher.states.react.process_chain.push({
            type: 'question', question: rewrittenQuestion, original: content,
          });

          if (!isRelevant) {
            this.dispatcher.eventchain.push(new Event(EventType.ANALYSIS));
            return EventStatus.COMPLETE;
          }
        } else {
          this.dispatcher.states.react.process_chain.push({ type: 'question', question: content });
        }
      } catch (err) {
        logger.error({ msg: 'Intent rewrite LLM call failed', err });
        this.dispatcher.states.react.process_chain.push({ type: 'question', question: content });
      }
    } else {
      let histories: string[] = [];
      if ('memory' in this.request.requester && typeof (this.request.requester as Record<string, unknown>)['memory'] === 'function') {
        try {
          const memory = await (this.request.requester as { memory: () => Promise<{ getOrCreateContextGraph: () => { memory: { nodes: Array<{ type: string; text: string }>; edges: unknown[] } } }> }).memory();
          const graphThread = memory.getOrCreateContextGraph();
          histories = graphThread.memory.nodes
            .filter((n: { type: string }) => n.type === 'content' || n.type === 'rewrite')
            .map((n: { text: string }) => n.text);
        } catch { histories = []; }
      }

      if (histories.length > 0) {
        this.dispatcher.states.react.process_chain.push({ type: 'histories', histories: histories.join('\n') });
      }
      this.dispatcher.states.react.process_chain.push({ type: 'question', question: content });
    }

    const availableTools: Record<string, unknown>[] = [];
    for (const [, tool] of this.dispatcher.toolsMap) {
      const t = tool as { toolTag?: { name: string; description: string; isSpecialized: boolean } };
      if (t.toolTag && !t.toolTag.isSpecialized) {
        availableTools.push({ name: t.toolTag.name, description: t.toolTag.description });
      }
    }
    this.dispatcher.states.react.available_tools = availableTools;

    this.dispatcher.eventchain.push(new Event(EventType.REACT_PRECALL));
    return EventStatus.COMPLETE;
  }
}
