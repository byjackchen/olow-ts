import {
  BaseFlow, flowRegistry, getLogger,
  CoreEventType, EventStatus,
} from '@olow/engine';
import type { Event, MessengerType } from '@olow/engine';
const logger = getLogger();
import { TextTemplate } from '@olow/templates';

@flowRegistry.register()
export class UnknownFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === CoreEventType.UNKNOWN;
  }

  async run(): Promise<EventStatus> {
    logger.warn(`UnknownFlow handling event: ${this.event.type}`);
    await this.event.propagateMsg(
      new TextTemplate(['I\'m not sure how to handle that request. Please try again.']),
    );
    return EventStatus.COMPLETE;
  }
}
