import { BaseFlow } from './base.flow.js';
import { EventType, EventStatus, type MessengerType } from '../engine/types.js';
import type { Event } from '../engine/events.js';
import { registerFlow } from '../engine/dispatcher.js';
import logger from '../engine/logger.js';

export class CommandFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.COMMAND;
  }

  async run(): Promise<EventStatus> {
    logger.info(`CommandFlow handling command for user ${this.request.requester.id}`);
    // TODO: Implement command handling logic
    return EventStatus.COMPLETE;
  }
}
registerFlow(CommandFlow);
