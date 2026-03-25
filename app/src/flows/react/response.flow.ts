import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType,
  ContentBlocks,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
const logger = getLogger();
import { AiReActAnswerTemplate, type Recommendation } from '../../templates/ai.template.js';
import { TextTemplate } from '../../templates/text.template.js';
import { I18n } from '../../templates/i18n.js';

@flowRegistry.register()
export class ReactResponseFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_RESPONSE;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactResponseFlow generating response for user ${this.request.requester.id}`);

    const processChain = this.dispatcher.states.react.process_chain;
    const cycleId = (this.dispatcher as { cycleId?: string }).cycleId ?? '';

    // Extract final answer, clarification, or last observation
    let responseText: string | null = null;
    const recommendations: Recommendation[] = [];

    // 1. Look for precall_tool recommendations
    for (const entry of processChain) {
      const e = entry as Record<string, unknown>;
      if (e['type'] === 'observation' && e['tool'] === 'precall_tool') {
        const data = e['data'] as unknown[];
        if (Array.isArray(data)) {
          for (const item of data) {
            const rec = item as Record<string, unknown>;
            if (rec['type'] === 'faq') {
              recommendations.push({
                type: 'faq',
                faqTitle: rec['faq_title'] as string,
                faqHash: rec['faq_hash'] as string,
              });
            } else if (rec['type'] === 'tool') {
              recommendations.push({
                type: 'tool',
                toolName: rec['tool_name'] as string,
                askMe: rec['ask_me'] as string,
                buttonKey: rec['button_key'] as string,
              });
            }
          }
        }
      }
    }

    // 2. Look for final_answer or clarification
    for (const entry of processChain) {
      const e = entry as Record<string, unknown>;
      if (e['type'] === 'final_answer' && !responseText) {
        responseText = e['final_answer'] as string;
      } else if (e['type'] === 'clarification' && !responseText) {
        responseText = e['clarification'] as string;
      }
    }

    // 3. Fallback: last observation or thought
    if (!responseText) {
      for (let i = processChain.length - 1; i >= 0; i--) {
        const e = processChain[i] as Record<string, unknown>;
        if (e['type'] === 'observation' && e['success']) {
          const data = e['data'];
          if (typeof data === 'string') {
            responseText = data;
            break;
          } else if (data && typeof data === 'object') {
            responseText = JSON.stringify(data, null, 2);
            break;
          }
        }
        if (e['type'] === 'thought') {
          responseText = e['thought'] as string;
          break;
        }
      }
    }

    // 4. Final fallback
    if (!responseText) {
      responseText = I18n.NO_ANSWER_FALLBACK(this.request.language ?? undefined);
    }

    // Store assistant response in shown_faqs for tracking
    if (recommendations.length > 0) {
      this.dispatcher.states.shown_faqs = recommendations
        .filter((r) => r.type === 'faq' && r.faqHash)
        .map((r) => r.faqHash!);
    }

    // Send response
    const answerTemplate = new AiReActAnswerTemplate({
      cycleId,
      text: responseText,
      recommendations,
      lang: this.request.language ?? undefined,
    });

    await this.event.propagateMsg(answerTemplate, undefined, undefined, FlowMsgType.ANSWER);

    // Append analysis event for tracking
    this.dispatcher.eventchain.push(new Event(EventType.ANALYSIS));

    return EventStatus.COMPLETE;
  }
}
