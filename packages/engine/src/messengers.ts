import type { IBroker } from './broker-interfaces.js';
import type {
  MessengerType,
  RequesterType,
  ActionType,
  SentToType,
  FlowMsgType,
  MsgType,
  SiteName,
  ChannelType,
} from './types.js';
import { MessengerType as MT } from './types.js';
import { ContentBlocks } from './content-blocks.js';
import type { ITemplate } from './base-template.js';
import type { IUser } from './events.js';

// ─── Request Init Result ───

export interface RequestInitResult {
  requester: IUser;
  action: ActionType;
  content: ContentBlocks;
  isKnown: boolean;
  selfMentioned: boolean | null;
  deviceType: string | null;
  site: SiteName | null;
  channelType: ChannelType | null;
  channelId: string | null;
  threadId: string | null;
  sessionId: string;
}

// ─── Say Result ───

export interface SayResult {
  msgType: MsgType;
  message: unknown;
  trackingId: string;
}

// ─── Messenger Interface ───

export interface IMessenger {
  readonly type: MessengerType;
  readonly supportsStreaming: boolean;

  initRequest(broker: IBroker, requesterType: RequesterType, msg: Record<string, unknown>): RequestInitResult;

  say(opts: {
    messageType: FlowMsgType;
    sentToType: SentToType;
    sentTo: string;
    dispatcher: unknown;
    template: ITemplate;
    reuseTrackingId?: string;
    revokeTrackingIds?: string[];
  }): Promise<SayResult>;
}

// ─── Session ID Resolution ───

function resolveSessionId(msg: Record<string, unknown>, channelType: ChannelType | null): string {
  if (channelType === 'group') return 'default';
  const sid = msg['SessionId'];
  if (typeof sid === 'string' && sid.trim()) return sid.trim();
  return 'default';
}

// ─── Factory ───

export function createMessenger(type: MessengerType): IMessenger {
  switch (type) {
    case MT.WEB_BOT:
      return new WebBotMessenger();
    case MT.WECOM_BOT:
      return new StubMessenger(type);
    case MT.WECOM_GROUPBOT:
      return new StubMessenger(type);
    case MT.SLACK_BOT:
      return new StubMessenger(type);
    case MT.BARE_TEXT:
      return new StubMessenger(type);
    default:
      throw new Error(`Unsupported messenger type: ${type}`);
  }
}

// ─── Web Bot Messenger ───

class WebBotMessenger implements IMessenger {
  readonly type = MT.WEB_BOT;
  readonly supportsStreaming = true;

  initRequest(broker: IBroker, _requesterType: RequesterType, msg: Record<string, unknown>): RequestInitResult {
    // Web bot uses standard user ID from payload
    const userId = (msg['UserId'] as string) ?? (msg['user_id'] as string) ?? 'unknown';
    const content = msg['content'] as string | undefined;
    const action = msg['action'] as string | undefined;
    const site = (msg['Site'] as string) ?? null;
    const channelType = 'single' as ChannelType;
    const sessionId = resolveSessionId(msg, channelType);

    // Lazy user - actual User class will be wired in Phase 4
    const requester: IUser = {
      type: 'User' as const,
      id: userId,
    };

    const { determineActionType } = require('./content-blocks.js');
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
    dispatcher: unknown;
    template: ITemplate;
    reuseTrackingId?: string;
    revokeTrackingIds?: string[];
  }): Promise<SayResult> {
    // Web bot messages are streamed via SSE, not posted
    // The dispatcher handles SSE encoding — say() is a no-op for web
    const [msgType, message] = opts.template.render(this.type);
    return { msgType, message, trackingId: '' };
  }
}

// ─── Stub Messenger (placeholder for unimplemented types) ───

class StubMessenger implements IMessenger {
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
    dispatcher: unknown;
    template: ITemplate;
  }): Promise<SayResult> {
    const [msgType, message] = opts.template.render(this.type);
    return { msgType, message, trackingId: '' };
  }
}

export { resolveSessionId };
