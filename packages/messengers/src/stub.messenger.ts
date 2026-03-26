import { ContentBlocks } from '@olow/engine';
import type {
  IBroker, MessengerType, RequesterType, FlowMsgType, SentToType,
  IMessenger, RequestInitResult, SayResult, ITemplate, IDispatcher,
} from '@olow/engine';

/**
 * Fallback messenger for unsupported types.
 * initRequest() does minimal parsing; say() is a no-op.
 */
export class StubMessenger implements IMessenger {
  readonly type: MessengerType;
  readonly supportsStreaming = false;

  constructor(type: MessengerType) {
    this.type = type;
  }

  initRequest(_broker: IBroker, _requesterType: RequesterType, msg: Record<string, unknown>): RequestInitResult {
    const userId = (msg['UserId'] as string) ?? (msg['FromUserName'] as string) ?? 'unknown';
    return {
      requester: { type: 'User', id: userId },
      action: 'query',
      content: ContentBlocks.fromText(String(msg['Content'] ?? msg['content'] ?? '')),
      isKnown: true,
      selfMentioned: null,
      deviceType: null,
      site: null,
      channelType: 'single',
      channelId: null,
      threadId: null,
      sessionId: 'default',
    };
  }

  async say(opts: {
    messageType: FlowMsgType;
    sentToType: SentToType;
    sentTo: string;
    dispatcher: IDispatcher;
    template: ITemplate;
  }): Promise<SayResult> {
    const [msgType, message] = opts.template.render(this.type);
    return { msgType, message, trackingId: '' };
  }
}
