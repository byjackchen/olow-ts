import { z } from 'zod';

// ═══════════════════ Enums as const objects ═══════════════════

export const ResponseMode = {
  POST: 'post',
  UPDATE: 'update',
  STREAM: 'stream',
} as const;
export type ResponseMode = (typeof ResponseMode)[keyof typeof ResponseMode];

export const SpaceType = {
  OHR: 'ohr',
  OIT: 'oit',
} as const;
export type SpaceType = (typeof SpaceType)[keyof typeof SpaceType];

export const RequesterType = {
  USER: 'User',
  SYSTEM: 'System',
} as const;
export type RequesterType = (typeof RequesterType)[keyof typeof RequesterType];

export const UserIdType = {
  STANDARD: 'Standard',
  WECOM: 'WeCom',
  SLACK: 'Slack',
} as const;
export type UserIdType = (typeof UserIdType)[keyof typeof UserIdType];

export const ChannelType = {
  SINGLE: 'single',
  GROUP: 'group',
} as const;
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export const SystemName = {
  DEFAULTSYS: 'DefaultSys',
  SERVICENOW: 'ServiceNow',
  JOBSAIRFLOW: 'JobsAirflow',
  WORKDAY: 'Workday',
} as const;
export type SystemName = (typeof SystemName)[keyof typeof SystemName];

export const SiteName = {
  WECOM: 'WeCom',
  SLACK: 'Slack',
  OIT_CENTER: 'OIT_Center',
} as const;
export type SiteName = (typeof SiteName)[keyof typeof SiteName];

export const MessengerType = {
  WECOM_BOT: 'WeCom_Bot',
  WECOM_GROUPBOT: 'WeCom_GroupBot',
  SLACK_BOT: 'Slack_Bot',
  WEB_BOT: 'Web_Bot',
  BARE_TEXT: 'Bare_Text',
} as const;
export type MessengerType = (typeof MessengerType)[keyof typeof MessengerType];

export const SentToType = {
  USER: 'user',
  GROUPCHAT: 'groupchat',
} as const;
export type SentToType = (typeof SentToType)[keyof typeof SentToType];

export const MsgType = {
  TEXT: 'text',
  FILE: 'file',
  IMAGE: 'image',
  JSON: 'json',
  WECOM_RICHTEXT: 'richtext',
  SLACK_BLOCKS: 'blocks',
} as const;
export type MsgType = (typeof MsgType)[keyof typeof MsgType];

export const FlowMsgType = {
  THINK_L1: 'think_l1',
  THINK_L2: 'think_l2',
  THINK_L3: 'think_l3',
  ANSWER: 'answer',
  NAVIGATE: 'navigate',
} as const;
export type FlowMsgType = (typeof FlowMsgType)[keyof typeof FlowMsgType];

// EventType is an open string — packages extend by defining their own const objects.
// Engine only defines the minimal core. Use string literal values directly.
export type EventType = string;

export const CoreEventType = {
  TRIAGE: 'triage',
  COMMAND: 'command',
  UNKNOWN: 'unknown',
  ANALYSIS: 'analysis',
  ACTION_CHAIN: 'action_chain',
} as const;

// Backward compat — re-export CoreEventType as EventType const so existing
// `EventType.TRIAGE` still works. Packages add their own const objects.
export const EventType = CoreEventType;

export const EventStatus = {
  AWAITING: 'awaiting',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
  FAILED: 'failed',
  NO_HANDLER: 'no_handler',
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

// ActionType is an open string — packages extend by defining their own const objects.
export type ActionType = string;

export const CoreActionType = {
  ENTER_CHAT: 'enter_chat',
  COMMAND: 'command',
  CLICK: 'click',
  QUERY: 'query',
  FILE: 'file',
  IMAGE: 'image',
  VOICE: 'voice',
  MIXED: 'mixed',
  UNKNOWN: 'unknown',
} as const;

export const ActionType = CoreActionType;

export const ToolArgumentType = {
  WECOM_MEDIA_ID: 'WeCom_Media_ID',
  STR: 'string',
  LIST: 'list',
  DATE: 'date',
  INT: 'integer',
} as const;
export type ToolArgumentType = (typeof ToolArgumentType)[keyof typeof ToolArgumentType];

export const Language = {
  CN: 'cn',
  EN: 'en',
} as const;
export type Language = (typeof Language)[keyof typeof Language];

export const TicketStates = {
  INITIALIZED: 'initialized',
  UNASSIGNED: 'unassigned',
  ASSIGNED: 'assigned',
  ASSIGNED_5MINS_ALERTED: 'assigned_5mins_alerted',
  ASSIGNED_10MINS_ALERTED: 'assigned_10mins_alerted',
  IN_PROGRESS: 'in_progress',
  ON_HOLD: 'on_hold',
  SOLUTION_PROPOSED: 'solution_proposed',
  CLOSED: 'closed',
} as const;
export type TicketStates = (typeof TicketStates)[keyof typeof TicketStates];

export const FunctionCallPredictionMode = {
  MATCH: 'match',
  DRILL: 'drill',
} as const;
export type FunctionCallPredictionMode = (typeof FunctionCallPredictionMode)[keyof typeof FunctionCallPredictionMode];

export const ACTION_CHAIN_ROOT_KEY = 'actionchain';

// ═══════════════════ Zod Schemas for Runtime Models ═══════════════════

export const ReActStatesSchema = z.object({
  process_chain: z.array(z.record(z.unknown())).default([]),
  rounds_count: z.number().default(0),
  user_preferences: z.array(z.string()).default([]),
  available_tools: z.array(z.record(z.unknown())).default([]),
});
export type ReActStates = z.infer<typeof ReActStatesSchema>;

export const FlowStatesSchema = z.object({
  click_validation: z.boolean().nullable().default(null),
  actionchain: z.record(z.unknown()).default({}),
  agent_support: z.record(z.unknown()).default({}),
  shown_faqs: z.array(z.unknown()).nullable().default(null),
  react: ReActStatesSchema.default({}),
  event_tracking: z.array(z.unknown()).default([]),
  service_response: z.record(z.unknown()).nullable().default(null),
});
export type FlowStates = z.infer<typeof FlowStatesSchema>;

export const DecodedMsgSchema = z.object({
  message_type: z.string().nullable().default(null),
  message: z.union([z.array(z.unknown()), z.record(z.unknown()), z.string()]).nullable().default(null),
  format_type: z.string().nullable().default(null),
  sent_to_type: z.string().nullable().default(null),
  sent_to: z.string().nullable().default(null),
});
export type DecodedMsg = z.infer<typeof DecodedMsgSchema>;

export const StreamDeltaMsgSchema = z.object({
  message_type: z.string(),
  delta: z.string(),
  is_complete: z.boolean().default(false),
});
export type StreamDeltaMsg = z.infer<typeof StreamDeltaMsgSchema>;

export const BotEngineStreamOutputSchema = z.object({
  type: z.enum(['message', 'states', 'stream_delta']),
  data: z.union([DecodedMsgSchema, FlowStatesSchema, StreamDeltaMsgSchema]),
});
export type BotEngineStreamOutput = z.infer<typeof BotEngineStreamOutputSchema>;

export interface MediaItem {
  id: string;
  type: string;
  format?: string;
  url?: string;
  name?: string;
  description?: string;
}

// ═══════════════════ MessageQueue ═══════════════════

type QueueResolver = () => void;

export class MessageQueue<T = unknown> {
  private queue: T[] = [];
  private waitResolvers: QueueResolver[] = [];
  private active = true;

  async put(msg: T): Promise<void> {
    if (!this.active) return;
    this.queue.push(msg);
    // Resolve any pending wait
    const resolver = this.waitResolvers.shift();
    if (resolver) resolver();
  }

  getNoWait(): T | undefined {
    return this.queue.shift();
  }

  waitForMessage(): Promise<void> {
    if (this.queue.length > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.waitResolvers.push(resolve);
    });
  }

  hasMessages(): boolean {
    return this.queue.length > 0;
  }

  close(): void {
    this.active = false;
    // Resolve all pending waits so they unblock
    for (const resolver of this.waitResolvers) {
      resolver();
    }
    this.waitResolvers = [];
  }

  get isActive(): boolean {
    return this.active;
  }
}
