import {
  BaseFlow, flowRegistry, getLogger,
  EventStatus, FlowMsgType,
} from '@olow/engine';
import type { Event, MessengerType } from '@olow/engine';
import { AppEventType } from '../events.js';
const logger = getLogger();
import { TextTemplate, I18n } from '@olow/templates';

@flowRegistry.register()
export class MenuFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === AppEventType.MENU;
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
