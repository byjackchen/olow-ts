import {
  MessengerType as MT, ContentBlocks, determineActionType, User, messengerRegistry,
} from '@olow/engine';
import type {
  IBroker, MessengerType, RequesterType, FlowMsgType, SentToType,
  ChannelType, SiteName, IMessenger, RequestInitResult, SayResult, ITemplate, IDispatcher,
} from '@olow/engine';
import { resolveSessionId } from './utils.js';

@messengerRegistry.register({ name: MT.WEB_BOT })
export class WebBotMessenger implements IMessenger {
  readonly type = MT.WEB_BOT;
  readonly supportsStreaming = true;

  initRequest(broker: IBroker, _requesterType: RequesterType, msg: Record<string, unknown>): RequestInitResult {
    const userId = (msg['UserId'] as string) ?? (msg['user_id'] as string) ?? 'unknown';
    const content = msg['content'] as string | undefined;
    const action = msg['action'] as string | undefined;
    const site = (msg['Site'] as string) ?? null;
    const channelType = 'single' as ChannelType;
    const sessionId = resolveSessionId(msg, channelType);

    const requester = new User(userId, broker);
    const contentBlocks = content ? ContentBlocks.fromText(content) : ContentBlocks.empty();
    const detectedAction = action === 'enter_chat' ? 'enter_chat' : determineActionType(contentBlocks);

    return {
      requester,
      action: detectedAction,
      content: contentBlocks,
      isKnown: true,
      selfMentioned: null,
      deviceType: (msg['DeviceType'] as string) ?? null,
      site: site as SiteName | null,
      channelType,
      channelId: null,
      threadId: null,
      sessionId,
    };
  }

  async say(opts: {
    messageType: FlowMsgType;
    sentToType: SentToType;
    sentTo: string;
    dispatcher: IDispatcher;
    template: ITemplate;
    reuseTrackingId?: string;
    revokeTrackingIds?: string[];
  }): Promise<SayResult> {
    // Web bot messages are streamed via SSE — say() only renders
    const [msgType, message] = opts.template.render(this.type);
    return { msgType, message, trackingId: '' };
  }
}
