import {
  BaseFlow, flowRegistry, getLogger,
  EventStatus, FlowMsgType,
} from '@olow/engine';
import type { Event, MessengerType } from '@olow/engine';
import { AppEventType } from '../events.js';
const logger = getLogger();
import { TextTemplate } from '@olow/messengers';

@flowRegistry.register()
export class SnTicketFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === AppEventType.TICKET_PUSH;
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
