import {
  BaseFlow, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import type { Event, MessengerType } from '@olow/engine';
const logger = getLogger();
import { TextTemplate } from '../../templates/text.template.js';

@flowRegistry.register()
export class ReactNavigateFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_NAVIGATE;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactNavigateFlow navigating for user ${this.request.requester.id}`);

    await this.event.propagateMsg(
      new TextTemplate(['Here are some options you can explore:']),
      undefined,
      undefined,
      FlowMsgType.NAVIGATE,
    );

    return EventStatus.COMPLETE;
  }
}
