import { BaseFlow } from './base.flow.js';
import { EventType, EventStatus, type MessengerType } from '../engine/types.js';
import type { Event } from '../engine/events.js';
import { TextTemplate } from '../templates/text.template.js';
import { registerFlow } from '../engine/dispatcher.js';
import logger from '../engine/logger.js';

export class UnknownFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.UNKNOWN;
  }

  async run(): Promise<EventStatus> {
    logger.warn(`UnknownFlow handling event: ${this.event.type}`);
    await this.event.propagateMsg(
      new TextTemplate(['I\'m not sure how to handle that request. Please try again.']),
    );
    return EventStatus.COMPLETE;
  }
}
registerFlow(UnknownFlow);
