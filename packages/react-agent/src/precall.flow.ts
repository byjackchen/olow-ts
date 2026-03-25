import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventStatus, recallProfile,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { ReactEventType } from './events.js';

const logger = getLogger();

@flowRegistry.register()
export class ReactPrecallFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === ReactEventType.REACT_PRECALL;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactPrecallFlow for user ${this.request.requester.id}`);

    // Retrieve user persona from ContextGraph USER_PROFILE nodes
    try {
      if ('memory' in this.request.requester) {
        const requester = this.request.requester as { memory(): Promise<{ graph: { nodes: Array<{ type: string; text: string; category?: string; metadata?: Record<string, unknown> }> } }> };
        const mem = await requester.memory();
        const entries = recallProfile(mem.graph as Parameters<typeof recallProfile>[0]);
        const persona: { summary: string; topics: Array<Record<string, unknown>>; tags: string[] } = {
          summary: '', topics: [], tags: [],
        };
        for (const entry of entries) {
          if (entry.category === 'summary') {
            persona.summary = entry.text;
          } else if (entry.category === 'topic') {
            persona.topics.push(entry.metadata ?? { topic: entry.text });
          } else if (entry.category === 'tag') {
            persona.tags.push(entry.text);
          }
        }
        this.dispatcher.states.react.user_persona = persona;
        logger.info(
          `Updated user_persona: summary=${!!persona.summary}, topics=${persona.topics.length}, tags=${persona.tags.length}`,
        );
      }
    } catch (err) {
      logger.warn({ msg: 'Failed to retrieve user persona', err });
      this.dispatcher.states.react.user_persona = {};
    }

    this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_PLAN));
    return EventStatus.COMPLETE;
  }
}
