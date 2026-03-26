import {
  MessengerType as MT, ContentBlocks, determineActionType, User,
  SentToType as STT, MsgType,
} from '@olow/engine';
import type {
  IBroker, MessengerType, RequesterType, FlowMsgType, SentToType,
  ChannelType, SiteName, IMessenger, RequestInitResult, SayResult, ITemplate, IDispatcher,
} from '@olow/engine';
import { resolveSessionId } from './utils.js';

export class WeComMessenger implements IMessenger {
  readonly type: MessengerType;
  readonly supportsStreaming = false;

  constructor(type: MessengerType = MT.WECOM_BOT) {
    this.type = type;
  }

  initRequest(broker: IBroker, _requesterType: RequesterType, msg: Record<string, unknown>): RequestInitResult {
    const userId = (msg['UserId'] as string) ?? (msg['FromUserName'] as string) ?? 'unknown';
    const content = msg['Content'] as string | undefined;
    const channelType = (msg['ChatType'] === 'group' ? 'group' : 'single') as ChannelType;
    const sessionId = resolveSessionId(msg, channelType);

    const requester = new User(userId, broker);
    const contentBlocks = content ? ContentBlocks.fromText(content) : ContentBlocks.empty();
    const detectedAction = determineActionType(contentBlocks);

    return {
      requester,
      action: detectedAction,
      content: contentBlocks,
      isKnown: true,
      selfMentioned: (msg['SelfMentioned'] as boolean) ?? null,
      deviceType: null,
      site: null,
      channelType,
      channelId: channelType === 'group' ? ((msg['ChatId'] as string) ?? null) : null,
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
    const [msgType, message] = opts.template.render(this.type);
    const messaging = opts.dispatcher.broker.messaging;

    if (typeof message === 'string' && message.trim()) {
      if (opts.sentToType === STT.GROUPCHAT) {
        await messaging.sendGroupText(opts.sentTo, message);
      } else if (msgType === MsgType.WECOM_RICHTEXT) {
        await messaging.sendRichText(opts.sentTo, message);
      } else {
        await messaging.sendText(opts.sentTo, message);
      }
    }

    return { msgType, message, trackingId: '' };
  }
}

export class WeComGroupBotMessenger extends WeComMessenger {
  constructor() {
    super(MT.WECOM_GROUPBOT);
  }
}
