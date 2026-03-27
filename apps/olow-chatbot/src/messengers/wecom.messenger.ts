import {
  MessengerType as MT, ContentBlocks, determineActionType, User,
  SentToType as STT, MsgType, messengerRegistry,
} from '@olow/engine';
import type {
  IBroker, MessengerType, RequesterType, FlowMsgType, SentToType,
  ChannelType, IMessenger, RequestInitResult, SayResult, ITemplate, IDispatcher,
} from '@olow/engine';
import * as wecomApi from '../services/wecom.api.js';
import type { Broker } from '../engine/broker.js';

function resolveSessionId(_msg: Record<string, unknown>, _channelType: ChannelType | null): string {
  return 'default';
}

async function withTokenRetry(broker: Broker, fn: (token: string) => Promise<void>): Promise<void> {
  try {
    const token = await broker.wecomBotTokenCache.get();
    await fn(token);
  } catch (err) {
    if (err instanceof wecomApi.AccessTokenError) {
      await broker.wecomBotTokenCache.forceRefresh();
      const token = await broker.wecomBotTokenCache.get();
      await fn(token);
    } else {
      throw err;
    }
  }
}

@messengerRegistry.register({ name: MT.WECOM_BOT })
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
    const broker = opts.dispatcher.broker as Broker;

    // Richtext: message is an array of atoms
    if (msgType === MsgType.WECOM_RICHTEXT && Array.isArray(message)) {
      await withTokenRetry(broker, (token) => wecomApi.sendSingleRichtextAtoms(token, opts.sentTo, message as unknown[]));
    } else if (typeof message === 'string' && message.trim()) {
      if (opts.sentToType === STT.GROUPCHAT) {
        const truncated = message.length > 5117 ? message.slice(0, 5117) + '\n...(truncated)' : message;
        await withTokenRetry(broker, (token) => wecomApi.sendGroupText(token, opts.sentTo, truncated));
      } else {
        await withTokenRetry(broker, (token) => wecomApi.sendSingleText(token, opts.sentTo, message));
      }
    }

    return { msgType, message, trackingId: '' };
  }
}
