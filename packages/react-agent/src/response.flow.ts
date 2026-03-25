import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType, ContentBlocks,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { getReactTemplateProvider } from './templates.js';
const logger = getLogger();

@flowRegistry.register()
export class ReactResponseFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_RESPONSE;
  }

  async run(): Promise<EventStatus> {
    const tpl = getReactTemplateProvider();
    logger.info(`ReactResponseFlow generating response for user ${this.request.requester.id}`);

    const processChain = this.dispatcher.states.react.process_chain;
    const cycleId = (this.dispatcher as { cycleId?: string }).cycleId ?? '';

    let responseText: string | null = null;
    const recommendations: unknown[] = [];

    for (const entry of processChain) {
      const e = entry as Record<string, unknown>;
      if (e['type'] === 'observation' && e['tool'] === 'precall_tool') {
        const data = e['data'] as unknown[];
        if (Array.isArray(data)) {
          for (const item of data) {
            recommendations.push(item);
          }
        }
      }
    }

    for (const entry of processChain) {
      const e = entry as Record<string, unknown>;
      if (e['type'] === 'final_answer' && !responseText) {
        responseText = e['final_answer'] as string;
      } else if (e['type'] === 'clarification' && !responseText) {
        responseText = e['clarification'] as string;
      }
    }

    if (!responseText) {
      for (let i = processChain.length - 1; i >= 0; i--) {
        const e = processChain[i] as Record<string, unknown>;
        if (e['type'] === 'observation' && e['success']) {
          const data = e['data'];
          if (typeof data === 'string') { responseText = data; break; }
          else if (data && typeof data === 'object') { responseText = JSON.stringify(data, null, 2); break; }
        }
        if (e['type'] === 'thought') { responseText = e['thought'] as string; break; }
      }
    }

    if (!responseText) {
      responseText = tpl.i18n.NO_ANSWER_FALLBACK(this.request.language ?? undefined);
    }

    if (recommendations.length > 0) {
      this.dispatcher.states.shown_faqs = recommendations
        .filter((r) => (r as Record<string, unknown>)['type'] === 'faq' && (r as Record<string, unknown>)['faq_hash'])
        .map((r) => (r as Record<string, unknown>)['faq_hash']);
    }

    const answerTemplate = tpl.aiReActAnswer({
      cycleId,
      text: responseText,
      recommendations,
      lang: this.request.language ?? undefined,
    });

    await this.event.propagateMsg(answerTemplate, undefined, undefined, FlowMsgType.ANSWER);
    this.dispatcher.eventchain.push(new Event(EventType.ANALYSIS));

    return EventStatus.COMPLETE;
  }
}
