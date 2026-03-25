import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventStatus, FlowMsgType,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { NavigateEventType } from './events.js';
import { getNavigateTemplateProvider } from './templates.js';

const logger = getLogger();

@flowRegistry.register()
export class NavigateFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === NavigateEventType.REACT_NAVIGATE;
  }

  async run(): Promise<EventStatus> {
    const tpl = getNavigateTemplateProvider();
    logger.info(`NavigateFlow for user ${this.request.requester.id}`);

    await this.event.propagateMsg(
      tpl.text([tpl.i18n.NAVIGATE_OPTIONS()]),
      undefined, undefined, FlowMsgType.NAVIGATE,
    );

    return EventStatus.COMPLETE;
  }
}
