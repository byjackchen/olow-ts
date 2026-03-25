import {
  type EventType,
  CoreEventType,
  type EventStatus,
  EventStatus as ES,
  type ActionType,
  CoreActionType,
  type RequesterType,
  RequesterType as RT,
  type FlowMsgType,
  FlowMsgType as FMT,
  type SentToType,
  type SystemName,
  type Language,
  type ChannelType,
  type SiteName,
  type MsgType,
  type FlowStates,
  FlowStatesSchema,
  MessageQueue,
} from './types.js';
import { ContentBlocks, determineActionType } from './content-blocks.js';
import type { IBroker } from './broker-interfaces.js';
import type { IMessenger } from './messengers.js';
import type { ITemplate } from './base-template.js';

// ─── Pluggable Routing ───

export type SystemActionParser = (msg: Record<string, unknown>) => ActionType | null;
export type EventRouter = (action: ActionType, msg: Record<string, unknown>, channelType: ChannelType | null) => EventType | null;

const _systemParsers: SystemActionParser[] = [];
const _eventRouters: EventRouter[] = [];

export function registerSystemActionParser(parser: SystemActionParser): void {
  _systemParsers.push(parser);
}

export function registerEventRouter(router: EventRouter): void {
  _eventRouters.push(router);
}

// ─── System Requester ───

export class SystemRequester {
  readonly type = RT.SYSTEM;
  readonly id: string;

  constructor(systemName: SystemName) {
    this.id = systemName;
  }
}

// ─── User (forward declaration - full impl in user.ts) ───

export interface IUser {
  readonly type: typeof RT.USER;
  readonly id: string;
}

// ─── FlowMsg ───

export interface FlowMsg {
  messageTemplate: ITemplate;
  sentToType?: SentToType;
  sentTo?: string;
  messageType?: FlowMsgType;
  reuseTrackingId?: string;
}

export interface StreamDeltaFlowMsg {
  messageType: FlowMsgType;
  delta: string;
  isComplete: boolean;
}

// ─── UniversalResponse ───

export interface UniversalResponse {
  timestamp: Date;
  sentToType: SentToType;
  sentTo: string;
  templateName: string;
  templateData: Record<string, unknown>;
  messageType: FlowMsgType;
  trackingId?: string;
}

export class ResponseChain extends Array<UniversalResponse> {
  toList(): Record<string, unknown>[] {
    return this.map((r) => ({
      timestamp: r.timestamp.toISOString(),
      sent_to_type: r.sentToType,
      sent_to: r.sentTo,
      template_name: r.templateName,
      template_data: r.templateData,
      message_type: r.messageType,
      tracking_id: r.trackingId ?? null,
    }));
  }
}

// ─── Event ───

export class Event {
  type: EventType;
  status: EventStatus;
  flow: unknown | null = null; // Will be BaseFlow
  dependencies: Event[];
  msgQueue: MessageQueue<FlowMsg | StreamDeltaFlowMsg> | null = null;

  constructor(type: EventType, status: EventStatus = ES.AWAITING, dependencies: Event[] = []) {
    this.type = type;
    this.status = status;
    this.dependencies = dependencies;
  }

  bindFlow(flow: unknown): void {
    this.flow = flow;
  }

  async propagateMsg(
    messageTemplate: ITemplate,
    sentToType?: SentToType,
    sentTo?: string,
    messageType: FlowMsgType = FMT.ANSWER,
    reuseTrackingId?: string,
  ): Promise<void> {
    const msg: FlowMsg = {
      messageTemplate,
      sentToType,
      sentTo,
      messageType,
      reuseTrackingId,
    };
    if (this.msgQueue) {
      await this.msgQueue.put(msg);
    } else {
      throw new Error('msg_queue not attached in Event object!');
    }
  }
}

// ─── EventChain ───

export class EventChain extends Array<Event> {
  alreadyProcessedFlowClass(flowClasses: unknown[]): boolean {
    for (const cls of flowClasses) {
      if (this.some((e) => e.flow instanceof (cls as new (...args: unknown[]) => unknown))) {
        return true;
      }
    }
    return false;
  }
}

// ─── Request ───

export class Request {
  readonly timestamp: Date;
  readonly broker: IBroker;
  readonly msg: Record<string, unknown>;
  language: Language | null = null;
  channelType: ChannelType | null = null;
  channelId: string | null = null;
  threadId: string | null = null;
  sessionId: string = 'default';
  selfMentioned: boolean | null = null;
  deviceType: string | null = null;
  requester!: IUser | SystemRequester;
  action: ActionType = CoreActionType.UNKNOWN;
  site: SiteName | null = null;

  private _content: ContentBlocks = ContentBlocks.empty();

  constructor(params: {
    requesterType: RequesterType;
    messenger: IMessenger | null;
    msg: Record<string, unknown>;
    broker: IBroker;
    systemName?: SystemName;
  }) {
    this.timestamp = new Date();
    this.broker = params.broker;
    this.msg = params.msg;

    let isKnown = false;

    if (params.requesterType === RT.USER && params.messenger) {
      const result = params.messenger.initRequest(params.broker, params.requesterType, params.msg);
      this.requester = result.requester;
      this.action = result.action;
      this.content = result.content;
      isKnown = result.isKnown;
      this.selfMentioned = result.selfMentioned;
      this.deviceType = result.deviceType;
      this.site = result.site;
      this.channelType = result.channelType;
      this.channelId = result.channelId;
      this.threadId = result.threadId;
      this.sessionId = result.sessionId;
    } else if (params.requesterType === RT.SYSTEM && params.systemName) {
      this.requester = new SystemRequester(params.systemName);
      isKnown = this.parseSystemAction(params.msg);
      this.content = ContentBlocks.fromText(`Inbound request: ${JSON.stringify(params.msg)}`);
    }

    if (!isKnown) {
      this.action = CoreActionType.UNKNOWN;
      this._content = ContentBlocks.empty();
    }
  }

  // ─── Content property ───

  get content(): ContentBlocks {
    return this._content;
  }

  set content(value: ContentBlocks | string | null) {
    if (value === null) {
      this._content = ContentBlocks.empty();
    } else if (typeof value === 'string') {
      this._content = value.trim() ? ContentBlocks.fromText(value) : ContentBlocks.empty();
    } else {
      this._content = value;
    }
  }

  // ─── System Action Parsing (pluggable) ───

  private parseSystemAction(msg: Record<string, unknown>): boolean {
    for (const parser of _systemParsers) {
      const action = parser(msg);
      if (action) {
        this.action = action;
        return true;
      }
    }
    return false;
  }

  // ─── Init Event (pluggable) ───

  initEvent(): Event {
    for (const router of _eventRouters) {
      const eventType = router(this.action, this.msg, this.channelType);
      if (eventType) return new Event(eventType);
    }
    return new Event(CoreEventType.UNKNOWN);
  }

  // ─── Language Detection ───

  static detectLanguage(text: string): Language {
    const cnPattern = /[\u4e00-\u9fff]/;
    return cnPattern.test(text) ? 'cn' : 'en';
  }
}
