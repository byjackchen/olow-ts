import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventType, EventStatus,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
const logger = getLogger();

@flowRegistry.register()
export class ReactPrecallFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_PRECALL;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactPrecallFlow handling precall for user ${this.request.requester.id}`);
    this.dispatcher.eventchain.push(new Event(EventType.REACT_PLAN));
    return EventStatus.COMPLETE;
  }
}
