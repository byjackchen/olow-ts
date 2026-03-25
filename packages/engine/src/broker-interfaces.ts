import type { MessageQueue } from './types.js';

// ═══════════════════ LLM Call Options ═══════════════════

export interface LlmCallOpts {
  jsonMode?: 'string' | 'json' | 'json_fence';
  provider?: string;
  model?: string;
}

// ═══════════════════ Sub-Provider Interfaces ═══════════════════

export interface ILlmProvider {
  callLlm(
    message: string,
    opts?: LlmCallOpts,
  ): Promise<[success: boolean, result: string | Record<string, unknown> | null]>;

  callLlmStream(
    message: string,
    msgQueue: MessageQueue | { put: (msg: unknown) => Promise<void> },
    opts?: LlmCallOpts,
  ): Promise<[success: boolean, result: string | Record<string, unknown> | null]>;
}

export interface IMessagingProvider {
  sendText(recipient: string, message: string): Promise<void>;
  sendRichText(recipient: string, content: string): Promise<void>;
  sendGroupText(groupId: string, message: string): Promise<void>;
  sendFile(recipient: string, mediaId: string): Promise<void>;
  sendImage(recipient: string, mediaId: string): Promise<void>;
  createChatGroup(name: string, userList: string[]): Promise<string>;
}

// ═══════════════════ Storage Types ═══════════════════

export interface CycleCreateParams {
  cycleId: string;
  requesterType: string;
  requesterId: string;
  requestSessionId: string;
  requestMsg: Record<string, unknown>;
  requestAction: string;
  requestContent: string;
  requestTime: Date;
  requestGroupchatId?: string | null;
  deviceType?: string | null;
  responses?: unknown[] | null;
  ticket?: unknown | null;
  isHelpful?: boolean | null;
  clicks?: string[] | null;
  shownFaqs?: unknown[] | null;
  flowStates?: Record<string, unknown> | null;
}

export interface CycleUpdateParams {
  responses?: unknown[];
  ticket?: unknown;
  isHelpful?: boolean;
  shownFaqs?: unknown[];
  clicks?: string[];
  flowStates?: Record<string, unknown>;
}

// ═══════════════════ Composite IBroker ═══════════════════

export interface IBroker {
  readonly llm: ILlmProvider;
  readonly messaging: IMessagingProvider;

  // Storage (direct methods)
  cyclesCreate(params: CycleCreateParams): Promise<string>;
  cyclesUpdate(id: string, update: CycleUpdateParams): Promise<void>;
  cyclesGetOneById(id: string): Promise<Record<string, unknown> | null>;
  getUser(userId: string): Promise<Record<string, unknown> | null>;
  upsertUser(userId: string, data: Record<string, unknown>): Promise<void>;
  getSystem(name: string): Promise<Record<string, unknown> | null>;
  upsertSystem(name: string, data: Record<string, unknown>): Promise<void>;

  // Cache (direct methods)
  getPeakShavingCount(): Promise<number>;
  incrementPeakShaving(ttlSeconds?: number): Promise<number>;

  // User ID resolution
  getUserId(idType: string, nonStdId: string): Promise<string>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
