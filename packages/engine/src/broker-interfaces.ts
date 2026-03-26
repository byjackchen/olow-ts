import type { MessageQueue } from '@olow/types';

// Re-export simple interfaces from @olow/types
export type {
  LlmCallOpts, CycleCreateParams, CycleUpdateParams,
  UserContextResult, IUserContextRefresher,
} from '@olow/types';

// ═══════════════════ Sub-Provider Interfaces ═══════════════════

export interface ILlmProvider {
  callLlm(
    message: string,
    opts?: import('@olow/types').LlmCallOpts,
  ): Promise<[success: boolean, result: string | Record<string, unknown> | null]>;

  callLlmStream(
    message: string,
    msgQueue: MessageQueue | { put: (msg: unknown) => Promise<void> },
    opts?: import('@olow/types').LlmCallOpts,
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

// ═══════════════════ Composite IBroker ═══════════════════

export interface IBroker {
  readonly llm: ILlmProvider;
  readonly messaging?: IMessagingProvider;

  // Storage (direct methods)
  cyclesCreate(params: import('@olow/types').CycleCreateParams): Promise<string>;
  cyclesUpdate(id: string, update: import('@olow/types').CycleUpdateParams): Promise<void>;
  cyclesGetOneById(id: string): Promise<Record<string, unknown> | null>;
  getUser(userId: string): Promise<Record<string, unknown> | null>;
  upsertUser(userId: string, data: Record<string, unknown>): Promise<void>;
  getSystem(name: string): Promise<Record<string, unknown> | null>;
  upsertSystem(name: string, data: Record<string, unknown>): Promise<void>;

  // Cache (direct methods)
  getPeakShavingCount(): Promise<number>;
  incrementPeakShaving(ttlSeconds?: number): Promise<number>;

  // User context refresh (optional — app provides IUserContextRefresher implementation)
  refreshUserContext?(userId: string, proxyUserId?: string): Promise<import('@olow/types').UserContextResult>;

  // User ID resolution
  getUserId(idType: string, nonStdId: string): Promise<string>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
