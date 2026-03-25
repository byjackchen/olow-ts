import { type MemoryContextGraph, createDefaultContextGraph, serialize as serializeGraph, deserialize as deserializeGraph, pruneOldSessions } from './context-graph.js';
import { type MemoryActionChain, createDefaultActionChain, MemoryActionChainSchema } from './action-chain.js';
import { type MemorySettings, createDefaultSettings, MemorySettingsSchema } from './settings.js';

// ─── Config ───

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

// ─── Storage Interface ───

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

// ─── Memory ───

export class Memory {
  readonly userId: string;
  graph: MemoryContextGraph;
  settings: MemorySettings;
  actionchain: MemoryActionChain | null;

  private _settingsUpdateTime: Date | null = null;
  private _actionchainUpdateTime: Date | null = null;

  constructor(userId: string) {
    this.userId = userId;
    this.graph = createDefaultContextGraph();
    this.settings = createDefaultSettings();
    this.actionchain = null;
  }

  async fetch(doc?: Record<string, unknown> | null): Promise<void> {
    if (!doc) {
      doc = await getMemoryStorage().getUser(this.userId);
    }
    if (!doc) return;

    const cfg = _memoryConfig;
    const now = new Date();
    const mem = doc['memory'] as Record<string, unknown> | undefined;
    if (!mem) return;

    // Graph
    const graphData = mem['graph'] as Record<string, unknown> | undefined;
    if (graphData) {
      this.graph = deserializeGraph(graphData);
    }

    // Settings (with expiry)
    const settingsData = mem['settings'] as Record<string, unknown> | undefined;
    const settingsTime = mem['settings_update_time'] as string | undefined;
    if (settingsData && settingsTime) {
      const updateTime = new Date(settingsTime);
      const elapsed = (now.getTime() - updateTime.getTime()) / 1000;
      if (elapsed < cfg.settings_expire_seconds) {
        this.settings = MemorySettingsSchema.parse(settingsData);
        this._settingsUpdateTime = updateTime;
      }
    }

    // ActionChain (with expiry)
    const acData = mem['actionchain'] as Record<string, unknown> | undefined;
    const acTime = mem['actionchain_update_time'] as string | undefined;
    if (acData && acTime) {
      const updateTime = new Date(acTime);
      const elapsed = (now.getTime() - updateTime.getTime()) / 1000;
      if (elapsed < cfg.actionchain_expire_seconds) {
        this.actionchain = MemoryActionChainSchema.parse(acData);
        this._actionchainUpdateTime = updateTime;
      }
    }
  }

  async save(): Promise<void> {
    pruneOldSessions(this.graph, _memoryConfig.graph_max_sessions);

    const now = new Date().toISOString();
    const mem: Record<string, unknown> = {
      graph: serializeGraph(this.graph),
      settings: this.settings,
      settings_update_time: this._settingsUpdateTime?.toISOString() ?? now,
    };

    if (this.actionchain) {
      mem['actionchain'] = this.actionchain;
      mem['actionchain_update_time'] = this._actionchainUpdateTime?.toISOString() ?? now;
    }

    await getMemoryStorage().upsertUser(this.userId, { memory: mem });
  }

  updateSettings(settings: Partial<MemorySettings>): void {
    this.settings = { ...this.settings, ...settings };
    this._settingsUpdateTime = new Date();
  }

  setActionChain(ac: MemoryActionChain | null): void {
    this.actionchain = ac;
    this._actionchainUpdateTime = ac ? new Date() : null;
  }
}

// Re-exports
export { type MemoryContextGraph, createDefaultContextGraph, addSession, addContentNode, getSessionContent, serialize as serializeGraph, deserialize as deserializeGraph, pruneOldSessions, writeProfile, recallProfile, syncProfile } from './context-graph.js';
export type { ContextNode, ContextEdge, UserPersona } from './context-graph.js';
export { type MemoryActionChain, createDefaultActionChain, MemoryActionChainSchema, ActionChainStepStatusSchema, ActionChainStepSchema, ActionChainEpisodeSchema } from './action-chain.js';
export type { ActionChainStep, ActionChainStepStatus, ActionChainEpisode } from './action-chain.js';
export { type MemorySettings, createDefaultSettings, MemorySettingsSchema } from './settings.js';
