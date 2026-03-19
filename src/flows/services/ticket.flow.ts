import { BaseFlow } from '../base.flow.js';
import { EventType, EventStatus, type MessengerType } from '../../engine/types.js';
import type { Event } from '../../engine/events.js';
import { registerFlow } from '../../engine/dispatcher.js';
import * as mongo from '../../storage/mongo.js';
import logger from '../../engine/logger.js';

export class BotServicesTicketFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.BOT_SERVICES_TICKET;
  }

  async run(): Promise<EventStatus> {
    logger.info(`BotServicesTicketFlow handling ticket service for user ${this.request.requester.id}`);

    const domain = this.request.msg['domain'] as string;
    const action = this.request.msg['action'] as string;
    const parameters = this.request.msg['parameters'] as Record<string, unknown>;

    logger.info({ msg: 'Ticket service request', domain, action, parameters });

    if (action === 'get_ticket') {
      const ticketId = parameters['ticket_id'] as string;
      if (ticketId) {
        const ticketDoc = await mongo.getTicket(ticketId);
        this.dispatcher.states.service_response = ticketDoc
          ? { status: 'success', data: ticketDoc as unknown as Record<string, unknown> }
          : { status: 'not_found', message: `Ticket ${ticketId} not found` };
      } else {
        this.dispatcher.states.service_response = { status: 'error', message: 'Missing ticket_id parameter' };
      }
    } else {
      this.dispatcher.states.service_response = { status: 'error', message: `Unknown action: ${action}` };
    }

    return EventStatus.COMPLETE;
  }
}
registerFlow(BotServicesTicketFlow);
