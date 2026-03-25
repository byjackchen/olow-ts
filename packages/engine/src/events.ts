import {
  type EventType,
  EventType as ET,
  type EventStatus,
  EventStatus as ES,
  type ActionType,
  ActionType as AT,
  type RequesterType,
  RequesterType as RT,
  type FlowMsgType,
  FlowMsgType as FMT,
  type SentToType,
  type SystemName,
  type Language,
  type ChannelType,
  ChannelType as CT,
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
  action: ActionType = AT.UNKNOWN;
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
      this.action = AT.UNKNOWN;
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

  // ─── System Action Parsing ───

  private parseSystemAction(msg: Record<string, unknown>): boolean {
    const source = msg['source'] as string | undefined;
    const type = msg['type'] as string | undefined;

    if (source === 'ServiceNow') {
      const ticketActions: Record<string, ActionType> = {
        ticketclosed: AT.SN_TICKET_CLOSE,
        reassign: AT.SN_TICKET_REASSIGN,
        ticketproposed: AT.SN_TICKET_SOLPROPOSED,
        ticketonhold: AT.SN_TICKET_ONHOLD,
        ticketsurvey: AT.SN_TICKET_SURVEY,
        ticketupdate: AT.CACHE_SYNC_TICKET,
        live_agent: AT.SN_AGENT_ASSIGN,
        agentbusy: AT.SN_AGENT_BUSY,
        agentlogout: AT.SN_AGENT_LOGOUT,
        faq_deploy: AT.FAQ_DEPLOY,
        faq_deploy_all: AT.FAQ_DEPLOY,
        faq_recall: AT.FAQ_RECALL,
        faq_recall_all: AT.FAQ_RECALL_ALL,
        faq_polish: AT.FAQ_POLISH,
        notification: AT.NOTIFICATION,
        survey: AT.NOTIFICATION,
      };

      if (type && type in ticketActions) {
        this.action = ticketActions[type]!;
        return true;
      }
    } else if (source === 'BotJobs') {
      if (type === 'ticketunassign') this.action = AT.SN_TICKET_UNASSIGN;
      else this.action = AT.BOTJOBS;
      return true;
    } else if (source === 'BotServices') {
      this.action = AT.BOT_SERVICES;
      return true;
    }

    return false;
  }

  // ─── Init Event ───

  initEvent(): Event {
    // System request
    if (this.requester.type === RT.SYSTEM) {
      const systemEventMap: Partial<Record<ActionType, EventType>> = {
        [AT.SN_TICKET_CLOSE]: ET.TICKET_PUSH,
        [AT.SN_TICKET_SURVEY]: ET.TICKET_PUSH,
        [AT.SN_TICKET_REASSIGN]: ET.TICKET_PUSH,
        [AT.SN_TICKET_SOLPROPOSED]: ET.TICKET_PUSH,
        [AT.SN_TICKET_UNASSIGN]: ET.TICKET_PUSH,
        [AT.SN_TICKET_ONHOLD]: ET.TICKET_PUSH,
        [AT.CACHE_SYNC_TICKET]: ET.CACHE_SYNC,
        [AT.FAQ_DEPLOY]: ET.SN_SYNC_FAQ,
        [AT.FAQ_RECALL]: ET.SN_SYNC_FAQ,
        [AT.FAQ_RECALL_ALL]: ET.SN_SYNC_FAQ,
        [AT.FAQ_POLISH]: ET.SN_SYNC_FAQ,
        [AT.SN_AGENT_ASSIGN]: ET.AGENT_POOL_PUSH,
        [AT.SN_AGENT_BUSY]: ET.AGENT_POOL_PUSH,
        [AT.SN_AGENT_LOGOUT]: ET.AGENT_POOL_PUSH,
        [AT.NOTIFICATION]: ET.NOTIFICATION,
        [AT.BOTJOBS]: ET.BOTJOBS,
      };

      const eventType = systemEventMap[this.action];
      if (eventType) return new Event(eventType);

      if (this.action === AT.BOT_SERVICES) {
        const domain = this.msg['domain'] as string;
        if (domain === 'user') return new Event(ET.BOT_SERVICES_USER);
        if (domain === 'ticket') return new Event(ET.BOT_SERVICES_TICKET);
        if (domain === 'notification') return new Event(ET.BOT_SERVICES_NOTIFICATION);
      }
    }

    // User request
    if (this.requester.type === RT.USER) {
      if (this.channelType === CT.SINGLE) {
        if (this.action === AT.ENTER_CHAT) return new Event(ET.GREETING);
        if (this.action === AT.COMMAND) return new Event(ET.COMMAND);
        if (this.action === AT.CLICK || this.action === AT.QUERY || this.action === AT.FILE) return new Event(ET.TRIAGE);
        if (this.action === AT.IMAGE || this.action === AT.MIXED) return new Event(ET.OCR);
        if (this.action === AT.VOICE) return new Event(ET.ASR);
      } else if (this.channelType === CT.GROUP) {
        if (this.action === AT.QUERY) return new Event(ET.GROUPCHAT_QUERY);
        if (this.action === AT.CLICK) return new Event(ET.GROUPCHAT_CLICK);
      }
    }

    return new Event(ET.UNKNOWN);
  }

  // ─── Language Detection ───

  static detectLanguage(text: string): Language {
    const cnPattern = /[\u4e00-\u9fff]/;
    return cnPattern.test(text) ? 'cn' : 'en';
  }
}
