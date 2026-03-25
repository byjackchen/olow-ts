import { BaseFlow } from '../base.flow.js';
import { EventType, EventStatus, type MessengerType, FlowMsgType } from '../../engine/types.js';
import type { Event } from '../../engine/events.js';
import { TextTemplate } from '../../templates/text.template.js';
import { flowRegistry } from '../../engine/registry.js';
import logger from '../../engine/logger.js';

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
