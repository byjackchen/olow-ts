import {
  BaseFlow, flowRegistry, getLogger,
  EventType, EventStatus,
} from '@olow/engine';
import type { Event, MessengerType } from '@olow/engine';
const logger = getLogger();
import * as mongo from '../../storage/mongo.js';

@flowRegistry.register()
export class BotServicesUserFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.BOT_SERVICES_USER;
  }

  async run(): Promise<EventStatus> {
    logger.info(`BotServicesUserFlow handling user service for user ${this.request.requester.id}`);

    const domain = this.request.msg['domain'] as string;
    const action = this.request.msg['action'] as string;
    const parameters = this.request.msg['parameters'] as Record<string, unknown>;

    logger.info({ msg: 'User service request', domain, action, parameters });

    if (action === 'get_info') {
      const userId = (parameters['user_id'] as string) ?? (parameters['rtx'] as string);
      if (userId) {
        const userDoc = await mongo.getUser(userId);
        this.dispatcher.states.service_response = userDoc
          ? { status: 'success', data: userDoc as unknown as Record<string, unknown> }
          : { status: 'not_found', message: `User ${userId} not found` };
      } else {
        this.dispatcher.states.service_response = { status: 'error', message: 'Missing user_id parameter' };
      }
    } else {
      this.dispatcher.states.service_response = { status: 'error', message: `Unknown action: ${action}` };
    }

    return EventStatus.COMPLETE;
  }
}
