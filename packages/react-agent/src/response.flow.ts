import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType,
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
    const processChain = this.dispatcher.states.react.process_chain;
    const cycleId = (this.dispatcher as { cycleId?: string }).cycleId ?? '';

    const recommendations = this.extractRecommendations(processChain);
    const responseText = this.extractResponse(processChain)
      ?? tpl.i18n.NO_ANSWER(this.request.language ?? undefined);

    if (recommendations.length > 0) {
      this.dispatcher.states.shown_faqs = recommendations
        .filter((r) => (r as Record<string, unknown>)['type'] === 'faq' && (r as Record<string, unknown>)['faq_hash'])
        .map((r) => (r as Record<string, unknown>)['faq_hash']);
    }

    await this.event.propagateMsg(
      tpl.answer({ cycleId, text: responseText, recommendations, lang: this.request.language ?? undefined }),
      undefined, undefined, FlowMsgType.ANSWER,
    );

    this.dispatcher.eventchain.push(new Event(EventType.ANALYSIS));
    return EventStatus.COMPLETE;
  }

  private extractRecommendations(chain: unknown[]): unknown[] {
    const results: unknown[] = [];
    for (const entry of chain) {
      const e = entry as Record<string, unknown>;
      if (e['type'] === 'observation' && e['tool'] === 'precall_tool' && Array.isArray(e['data'])) {
        results.push(...(e['data'] as unknown[]));
      }
    }
    return results;
  }

  private extractResponse(chain: unknown[]): string | null {
    for (const entry of chain) {
      const e = entry as Record<string, unknown>;
      if (e['type'] === 'final_answer') return e['final_answer'] as string;
      if (e['type'] === 'clarification') return e['clarification'] as string;
    }

    for (let i = chain.length - 1; i >= 0; i--) {
      const e = chain[i] as Record<string, unknown>;
      if (e['type'] === 'observation' && e['success']) {
        const data = e['data'];
        if (typeof data === 'string') return data;
        if (data && typeof data === 'object') return JSON.stringify(data, null, 2);
      }
      if (e['type'] === 'thought') return e['thought'] as string;
    }

    return null;
  }
}
