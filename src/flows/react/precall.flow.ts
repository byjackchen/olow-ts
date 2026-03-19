import { BaseFlow } from '../base.flow.js';
import { EventType, EventStatus, type MessengerType } from '../../engine/types.js';
import { Event } from '../../engine/events.js';
import { registerFlow } from '../../engine/dispatcher.js';
import logger from '../../engine/logger.js';

export class ReactPrecallFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_PRECALL;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactPrecallFlow handling precall for user ${this.request.requester.id}`);

    // Pass-through: chain directly to REACT_PLAN
    this.dispatcher.eventchain.push(new Event(EventType.REACT_PLAN));

    return EventStatus.COMPLETE;
  }
}
registerFlow(ReactPrecallFlow);
