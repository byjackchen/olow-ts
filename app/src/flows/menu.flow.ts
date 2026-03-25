import {
  BaseFlow, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import type { Event, MessengerType } from '@olow/engine';
const logger = getLogger();
import { TextTemplate } from '../templates/text.template.js';
import { I18n } from '../templates/i18n.js';

@flowRegistry.register()
export class MenuFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.MENU;
  }

  async run(): Promise<EventStatus> {
    logger.info(`MenuFlow handling menu for user ${this.request.requester.id}`);

    await this.event.propagateMsg(
      new TextTemplate([
        I18n.GREETING,
        () => '\n\nHow can I assist you?\n1. Ask a question\n2. Check ticket status\n3. Contact support\n\nType /help for available commands.',
      ]),
      undefined,
      undefined,
      FlowMsgType.ANSWER,
    );

    return EventStatus.COMPLETE;
  }
}
