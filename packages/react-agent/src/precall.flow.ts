import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventStatus,
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
    this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_PLAN));
    return EventStatus.COMPLETE;
  }
}
