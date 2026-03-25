import {
  BaseFlow, flowRegistry, getLogger,
  EventType, EventStatus,
} from '@olow/engine';
import type { Event, MessengerType } from '@olow/engine';
const logger = getLogger();

@flowRegistry.register()
export class BotServicesNotificationFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.BOT_SERVICES_NOTIFICATION;
  }

  async run(): Promise<EventStatus> {
    logger.info(`BotServicesNotificationFlow handling notification service for user ${this.request.requester.id}`);

    const parameters = this.request.msg['parameters'] as Record<string, unknown>;
    const targetUser = parameters['target_user'] as string;
    const message = parameters['message'] as string;

    logger.info({ msg: 'Notification service request', targetUser, message });

    if (targetUser && message) {
      try {
        await this.broker.messaging.sendText(targetUser, message);
        this.dispatcher.states.service_response = { status: 'success', message: 'Notification sent' };
      } catch (err) {
        logger.error({ msg: 'Failed to send notification', err });
        this.dispatcher.states.service_response = { status: 'error', message: 'Failed to send notification' };
      }
    } else {
      this.dispatcher.states.service_response = { status: 'error', message: 'Missing target_user or message parameter' };
    }

    return EventStatus.COMPLETE;
  }
}
