import { config } from '../../config/index.js';
import logger from '../logger.js';
import * as mongo from '../../storage/mongo.js';
import { type MemoryContextGraph, createDefaultContextGraph, serialize as serializeGraph, deserialize as deserializeGraph, pruneOldSessions } from './context-graph.js';
import { type MemoryActionChain, createDefaultActionChain, MemoryActionChainSchema } from './action-chain.js';
import { type MemorySettings, createDefaultSettings, MemorySettingsSchema } from './settings.js';

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
      const doc = await mongo.getUser(this.userId);
      memoryThreadsDoc = (doc?.['memory_threads'] as unknown[] | undefined) ?? [];
    }

    for (const threadDoc of memoryThreadsDoc as Array<Record<string, unknown>>) {
      const name = threadDoc['name'] as MemoryThreadName;
      const updateTime = new Date(threadDoc['update_time'] as string);
      const memoryData = threadDoc['memory'] as Record<string, unknown>;

      // Check expiration
      const now = new Date();
      if (name === MemoryThreadName.CONTEXTGRAPH) {
        this.threads.set(name, {
          name,
          memory: deserializeGraph(memoryData ?? {}),
          updateTime,
        });
      } else if (name === MemoryThreadName.SETTINGS) {
        const elapsed = (now.getTime() - updateTime.getTime()) / 1000;
        if (elapsed < config.engine.memory.settings_expire_seconds) {
          this.threads.set(name, {
            name,
            memory: MemorySettingsSchema.parse(memoryData ?? {}),
            updateTime,
          });
        }
      } else if (name.startsWith('actionchain-')) {
        const elapsed = (now.getTime() - updateTime.getTime()) / 1000;
        if (elapsed < config.engine.memory.actionchain_expire_seconds) {
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
    // Prune context graph before saving
    const graphThread = this.threads.get(MemoryThreadName.CONTEXTGRAPH);
    if (graphThread) {
      pruneOldSessions(graphThread.memory as MemoryContextGraph, config.engine.memory.graph_max_sessions);
    }

    // Serialize all threads
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

    await mongo.upsertUser(this.userId, { memoryThreads: { threads: threadsDoc } as unknown as Record<string, unknown> });
  }
}

export { type MemoryContextGraph, type MemoryActionChain, type MemorySettings };
