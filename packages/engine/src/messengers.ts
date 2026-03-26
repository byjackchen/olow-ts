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
import type { IBroker } from './broker-interfaces.js';
import type { ITemplate } from './base-template.js';
import type { IUser } from './events.js';
import type { IDispatcher } from './base-flow.js';
import type { ContentBlocks } from './content-blocks.js';

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
    dispatcher: IDispatcher;
    template: ITemplate;
    reuseTrackingId?: string;
    revokeTrackingIds?: string[];
  }): Promise<SayResult>;
}
