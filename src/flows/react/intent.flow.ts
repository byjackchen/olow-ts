import { BaseFlow } from '../base.flow.js';
import { EventType, EventStatus, type MessengerType, FlowMsgType } from '../../engine/types.js';
import { Event, Request } from '../../engine/events.js';
import { AiIdleTemplate } from '../../templates/ai.template.js';
import { I18n } from '../../templates/i18n.js';
import { registerFlow } from '../../engine/dispatcher.js';
import { config } from '../../config/index.js';
import * as promptKit from '../../kits/prompt.kit.js';
import logger from '../../engine/logger.js';

export class ReactIntentFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_INTENT;
  }

  async run(): Promise<EventStatus> {
    const userId = this.request.requester.id;
    logger.info(`ReactIntentFlow analyzing intent for user ${userId}`);

    const rawMode = config.engine.react_agent.intent_mode;
    const mode = rawMode.replace(/_/g, '-').toLowerCase();
    const content = this.request.content.mixedText;

    // Initialize react states
    if (!this.dispatcher.states.react.process_chain) {
      this.dispatcher.states.react.process_chain = [];
    }

    // Send thinking indicator
    await this.event.propagateMsg(
      new AiIdleTemplate([I18n.AI_INTENT]),
      undefined,
      undefined,
      FlowMsgType.THINK_L1,
    );

    if (mode === 'single-rewritten') {
      // Full query rewriting mode with LLM
      // Get conversation history from graph memory
      let chatHistory = '';
      if ('memory' in this.request.requester && typeof (this.request.requester as Record<string, unknown>)['memory'] === 'function') {
        try {
          const memory = await (this.request.requester as { memory: () => Promise<{ getOrCreateContextGraph: () => { memory: { nodes: Array<{ type: string; text: string }>; edges: unknown[] } } }> }).memory();
          const graphThread = memory.getOrCreateContextGraph();
          const contentNodes = graphThread.memory.nodes
            .filter((n: { type: string }) => n.type === 'content' || n.type === 'rewrite')
            .map((n: { text: string }) => n.text);
          chatHistory = contentNodes.join('\n');
        } catch {
          chatHistory = '';
        }
      }

      try {
        const [success, result] = await this.broker.callLlm(
          promptKit.reactIntentPrompt(content, chatHistory || undefined),
          { jsonMode: 'json_fence' },
        );

        if (success && result && typeof result === 'object') {
          const parsed = result as Record<string, unknown>;
          const rewrittenQuestion = (parsed['rewritten_question'] as string) ?? content;
          const isRelevant = parsed['is_relevant'] !== false;

          // Append to process chain
          this.dispatcher.states.react.process_chain.push({
            type: 'question',
            question: rewrittenQuestion,
            original: content,
          });

          // If not relevant, route to analysis instead
          if (!isRelevant) {
            this.dispatcher.eventchain.push(new Event(EventType.ANALYSIS));
            return EventStatus.COMPLETE;
          }
        } else {
          // LLM failed — use original query
          this.dispatcher.states.react.process_chain.push({
            type: 'question',
            question: content,
          });
        }
      } catch (err) {
        logger.error({ msg: 'Intent rewrite LLM call failed', err });
        this.dispatcher.states.react.process_chain.push({
          type: 'question',
          question: content,
        });
      }
    } else {
      // Multi-turns mode — use conversation history directly
      let histories: string[] = [];
      if ('memory' in this.request.requester && typeof (this.request.requester as Record<string, unknown>)['memory'] === 'function') {
        try {
          const memory = await (this.request.requester as { memory: () => Promise<{ getOrCreateContextGraph: () => { memory: { nodes: Array<{ type: string; text: string }>; edges: unknown[] } } }> }).memory();
          const graphThread = memory.getOrCreateContextGraph();
          histories = graphThread.memory.nodes
            .filter((n: { type: string }) => n.type === 'content' || n.type === 'rewrite')
            .map((n: { text: string }) => n.text);
        } catch {
          histories = [];
        }
      }

      if (histories.length > 0) {
        this.dispatcher.states.react.process_chain.push({
          type: 'histories',
          histories: histories.join('\n'),
        });
      }

      this.dispatcher.states.react.process_chain.push({
        type: 'question',
        question: content,
      });
    }

    // Build initial available tools list
    const availableTools: Record<string, unknown>[] = [];
    for (const [name, tool] of this.dispatcher.toolsMap) {
      const t = tool as { toolTag?: { name: string; description: string; isSpecialized: boolean } };
      if (t.toolTag && !t.toolTag.isSpecialized) {
        availableTools.push({
          name: t.toolTag.name,
          description: t.toolTag.description,
        });
      }
    }
    this.dispatcher.states.react.available_tools = availableTools;

    // Chain to precall step
    this.dispatcher.eventchain.push(new Event(EventType.REACT_PRECALL));
    return EventStatus.COMPLETE;
  }
}
registerFlow(ReactIntentFlow);
