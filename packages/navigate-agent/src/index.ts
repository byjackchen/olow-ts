// @olow/navigate-agent — Navigation suggestion flow
export { navigatePrompt } from './prompts.js';

import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import type { ITemplate, MessengerType } from '@olow/engine';
const logger = getLogger();

export type NavigateTemplateFactory = (lines: string[]) => ITemplate;

let _templateFactory: NavigateTemplateFactory | null = null;

export function setNavigateTemplateFactory(factory: NavigateTemplateFactory): void {
  _templateFactory = factory;
}

function getTemplate(lines: string[]): ITemplate {
  if (!_templateFactory) {
    throw new Error('Navigate template factory not set. Call setNavigateTemplateFactory() at startup.');
  }
  return _templateFactory(lines);
}

@flowRegistry.register()
export class ReactNavigateFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_NAVIGATE;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactNavigateFlow navigating for user ${this.request.requester.id}`);

    await this.event.propagateMsg(
      getTemplate(['Here are some options you can explore:']),
      undefined, undefined, FlowMsgType.NAVIGATE,
    );

    return EventStatus.COMPLETE;
  }
}
