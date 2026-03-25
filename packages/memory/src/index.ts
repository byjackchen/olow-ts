import { type MemoryContextGraph, createDefaultContextGraph, serialize as serializeGraph, deserialize as deserializeGraph, pruneOldSessions } from './context-graph.js';
import { type MemoryActionChain, createDefaultActionChain, MemoryActionChainSchema } from './action-chain.js';
import { type MemorySettings, createDefaultSettings, MemorySettingsSchema } from './settings.js';

// ─── Memory Config ───

export interface MemoryConfig {
  settings_expire_seconds: number;
  actionchain_expire_seconds: number;
  graph_max_sessions: number;
  graph_nodes_max_tokens: number;
}

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  settings_expire_seconds: 259200,
  actionchain_expire_seconds: 300,
  graph_max_sessions: 3,
  graph_nodes_max_tokens: 6000,
};

let _memoryConfig: MemoryConfig = DEFAULT_MEMORY_CONFIG;

export function setMemoryConfig(cfg: MemoryConfig): void {
  _memoryConfig = cfg;
}

export function getMemoryConfig(): MemoryConfig {
  return _memoryConfig;
}

// ─── Memory Storage Interface ───

export interface IMemoryStorage {
  getUser(userId: string): Promise<Record<string, unknown> | null>;
  upsertUser(userId: string, data: Record<string, unknown>): Promise<void>;
}

let _memoryStorage: IMemoryStorage | null = null;

export function setMemoryStorage(storage: IMemoryStorage): void {
  _memoryStorage = storage;
}

function getMemoryStorage(): IMemoryStorage {
  if (!_memoryStorage) {
    throw new Error('Memory storage not initialized. Call setMemoryStorage() at startup.');
  }
  return _memoryStorage;
}

// ─── Thread Names ───

export const MemoryThreadName = {
  CONTEXTGRAPH: 'ContextGraph',
  SETTINGS: 'Settings',
  SKIP_GREETING: 'skip_greeting',
  PHOTO_TICKET: 'actionchain-phototicket',
  FAQ_FEEDBACK: 'actionchain-faqfeedback',
  GENERAL_FEEDBACK: 'actionchain-generalfeedback',
  TICKET_RATING: 'actionchain-rateticket',
  SURVEY: 'actionchain-survey',
  NOTIFICATION_SCHEDULE: 'actionchain-notificationschedule',
  GUEST_WIFI: 'actionchain-guestwifi',
  TENCENT_WIFI: 'actionchain-tencentwifi',
  SITE_ENGINEER: 'actionchain-siteengineer',
  LIVE_AGENT_SUPPORT: 'actionchain-liveagentsupport',
  REQUEST_TIMEOFF: 'actionchain-requesttimeoff',
  REQUEST_ACCESSORIES: 'actionchain-requestitaccessories',
} as const;
export type MemoryThreadName = (typeof MemoryThreadName)[keyof typeof MemoryThreadName];

// ─── Memory Thread ───

export interface MemoryThread<T = unknown> {
  name: MemoryThreadName;
  memory: T;
  updateTime: Date;
}

// ─── Memory ───

export class Memory {
  readonly userId: string;
  private threads = new Map<string, MemoryThread>();

  constructor(userId: string) {
    this.userId = userId;
  }

  async fetchMemory(memoryThreadsDoc?: unknown[]): Promise<void> {
    if (!memoryThreadsDoc) {
      const doc = await getMemoryStorage().getUser(this.userId);
      memoryThreadsDoc = (doc?.['memory_threads'] as unknown[] | undefined) ?? [];
    }

    const cfg = _memoryConfig;

    for (const threadDoc of memoryThreadsDoc as Array<Record<string, unknown>>) {
      const name = threadDoc['name'] as MemoryThreadName;
      const updateTime = new Date(threadDoc['update_time'] as string);
      const memoryData = threadDoc['memory'] as Record<string, unknown>;

      const now = new Date();
      if (name === MemoryThreadName.CONTEXTGRAPH) {
        this.threads.set(name, {
          name,
          memory: deserializeGraph(memoryData ?? {}),
          updateTime,
        });
      } else if (name === MemoryThreadName.SETTINGS) {
        const elapsed = (now.getTime() - updateTime.getTime()) / 1000;
        if (elapsed < cfg.settings_expire_seconds) {
          this.threads.set(name, {
            name,
            memory: MemorySettingsSchema.parse(memoryData ?? {}),
            updateTime,
          });
        }
      } else if (name.startsWith('actionchain-')) {
        const elapsed = (now.getTime() - updateTime.getTime()) / 1000;
        if (elapsed < cfg.actionchain_expire_seconds) {
          this.threads.set(name, {
            name,
            memory: MemoryActionChainSchema.parse(memoryData ?? {}),
            updateTime,
          });
        }
      } else {
        this.threads.set(name, { name, memory: memoryData, updateTime });
      }
    }
  }

  getThread<T = unknown>(name: MemoryThreadName): MemoryThread<T> | undefined {
    return this.threads.get(name) as MemoryThread<T> | undefined;
  }

  setThread(name: MemoryThreadName, memory: unknown): void {
    this.threads.set(name, { name, memory, updateTime: new Date() });
  }

  removeThread(name: MemoryThreadName): boolean {
    return this.threads.delete(name);
  }

  getThreadsByMemoryType<T>(
    typeGuard: (m: unknown) => m is T,
  ): MemoryThread<T>[] {
    const result: MemoryThread<T>[] = [];
    for (const thread of this.threads.values()) {
      if (typeGuard(thread.memory)) {
        result.push(thread as MemoryThread<T>);
      }
    }
    return result;
  }

  getOrCreateContextGraph(): MemoryThread<MemoryContextGraph> {
    let thread = this.threads.get(MemoryThreadName.CONTEXTGRAPH);
    if (!thread) {
      thread = {
        name: MemoryThreadName.CONTEXTGRAPH,
        memory: createDefaultContextGraph(),
        updateTime: new Date(),
      };
      this.threads.set(MemoryThreadName.CONTEXTGRAPH, thread);
    }
    return thread as MemoryThread<MemoryContextGraph>;
  }

  async saveMemory(): Promise<void> {
    const graphThread = this.threads.get(MemoryThreadName.CONTEXTGRAPH);
    if (graphThread) {
      pruneOldSessions(graphThread.memory as MemoryContextGraph, _memoryConfig.graph_max_sessions);
    }

    const threadsDoc = [...this.threads.values()].map((thread) => {
      let memoryData: unknown;
      if (thread.name === MemoryThreadName.CONTEXTGRAPH) {
        memoryData = serializeGraph(thread.memory as MemoryContextGraph);
      } else {
        memoryData = thread.memory;
      }
      return {
        name: thread.name,
        memory: memoryData,
        update_time: thread.updateTime.toISOString(),
      };
    });

    await getMemoryStorage().upsertUser(this.userId, { memoryThreads: { threads: threadsDoc } as unknown as Record<string, unknown> });
  }
}

// Re-export sub-module types
export { type MemoryContextGraph, createDefaultContextGraph, addSession, addContentNode, getSessionContent, serialize as serializeGraph, deserialize as deserializeGraph, pruneOldSessions } from './context-graph.js';
export type { ContextNode, ContextEdge } from './context-graph.js';
export { type MemoryActionChain, createDefaultActionChain, MemoryActionChainSchema, ActionChainStepStatusSchema, ActionChainStepSchema, ActionChainEpisodeSchema } from './action-chain.js';
export type { ActionChainStep, ActionChainStepStatus, ActionChainEpisode } from './action-chain.js';
export { type MemorySettings, createDefaultSettings, MemorySettingsSchema } from './settings.js';
