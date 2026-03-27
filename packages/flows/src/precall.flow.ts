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
      const { requester } = this.request;
      if ('memory' in requester && requester.memory) {
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

    // Chain REACT_PLAN (always)
    this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_PLAN));

    // Chain REACT_NAVIGATE in parallel (for web portal sites)
    if (this.request.site) {
      // Navigation items should be provided by app (e.g., fetched from API and set in states)
      this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_NAVIGATE));
    }

    return EventStatus.COMPLETE;
  }
}
