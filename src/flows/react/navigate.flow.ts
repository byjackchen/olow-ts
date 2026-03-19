import { BaseFlow } from '../base.flow.js';
import { EventType, EventStatus, type MessengerType } from '../../engine/types.js';
import type { Event } from '../../engine/events.js';
import { registerFlow } from '../../engine/dispatcher.js';
import logger from '../../engine/logger.js';

export class ReactNavigateFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_NAVIGATE;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactNavigateFlow navigating for user ${this.request.requester.id}`);
    // TODO: Implement navigate logic
    return EventStatus.COMPLETE;
  }
}
registerFlow(ReactNavigateFlow);
