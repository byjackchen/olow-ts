import { BaseFlow } from '../base.flow.js';
import { EventType, EventStatus, type MessengerType } from '../../engine/types.js';
import type { Event } from '../../engine/events.js';
import { registerFlow } from '../../engine/dispatcher.js';
import logger from '../../engine/logger.js';

export class BotServicesNotificationFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.BOT_SERVICES_NOTIFICATION;
  }

  async run(): Promise<EventStatus> {
    logger.info(`BotServicesNotificationFlow handling notification service for user ${this.request.requester.id}`);
    // TODO: Implement bot services notification logic
    return EventStatus.COMPLETE;
  }
}
registerFlow(BotServicesNotificationFlow);
