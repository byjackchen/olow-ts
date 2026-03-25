import { BaseFlow } from './base.flow.js';
import { EventType, EventStatus, type MessengerType, FlowMsgType } from '../engine/types.js';
import type { Event } from '../engine/events.js';
import { TextTemplate } from '../templates/text.template.js';
import { flowRegistry } from '../engine/registry.js';
import logger from '../engine/logger.js';

@flowRegistry.register()
export class SnTicketFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.TICKET_PUSH;
  }

  async run(): Promise<EventStatus> {
    logger.info(`SnTicketFlow handling ticket push for user ${this.request.requester.id}`);

    const action = this.request.action;
    const data = this.request.msg;
    logger.info({ msg: 'ServiceNow ticket push', action, data });

    await this.event.propagateMsg(
      new TextTemplate([`Ticket update received: ${action}`]),
      undefined,
      undefined,
      FlowMsgType.ANSWER,
    );

    return EventStatus.COMPLETE;
  }
}
