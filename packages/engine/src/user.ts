import { RequesterType as RT } from './types.js';
import { Memory } from './memory/index.js';
import { syncProfile } from './memory/index.js';
import type { IBroker } from './broker-interfaces.js';
import type { IUser } from './events.js';
import { getLogger } from './logger.js';
const logger = getLogger();

// ─── User ───

export class User implements IUser {
  readonly type = RT.USER;
  readonly id: string;

  private _memory: Memory | null = null;
  private _context: Record<string, unknown> | null = null;
  private _vip: Record<string, unknown> | null = null;
  private broker: IBroker;

  constructor(id: string, broker: IBroker) {
    this.id = id;
    this.broker = broker;
  }

  async memory(): Promise<Memory> {
    if (!this._memory) {
      this._memory = new Memory(this.id);
      await this._memory.fetch();
    }
    return this._memory;
  }

  get memoryLoaded(): boolean {
    return this._memory !== null;
  }

  async context(): Promise<Record<string, unknown>> {
    if (!this._context) {
      await this.loadAllInfo();
    }
    return this._context ?? {};
  }

  async vip(): Promise<Record<string, unknown>> {
    if (!this._vip) {
      await this.loadAllInfo();
    }
    return this._vip ?? {};
  }

  // ─── Explicit refresh (for /proxy and services API) ───

  async refreshContext(proxyUserId?: string): Promise<void> {
    if (!this.broker.refreshUserContext) return;

    try {
      const result = await this.broker.refreshUserContext(this.id, proxyUserId);
      await this.applyRefreshResult(result);
    } catch (err) {
      logger.warn({ msg: 'Failed to refresh user context', userId: this.id, err });
    }
  }

  // ─── Internal ───

  private async loadAllInfo(): Promise<void> {
    const doc = await this.broker.getUser(this.id);

    // Context buffer with TTL check
    let needsRefresh = true;
    if (doc?.['context_buffer']) {
      const buffer = doc['context_buffer'] as Record<string, unknown>;
      const timestamp = buffer['timestamp'] as Date | undefined;
      if (timestamp) {
        const cutoffMs = 259200 * 1000; // 3 days
        if (Date.now() - new Date(timestamp).getTime() < cutoffMs) {
          this._context = (buffer['context'] as Record<string, unknown>) ?? {};
          needsRefresh = false;
        }
      }
    }

    // Memory
    if (!this._memory) {
      this._memory = new Memory(this.id);
      await this._memory.fetch(doc);
    }

    // Refresh context + profile when expired
    if (needsRefresh && this.broker.refreshUserContext) {
      try {
        const result = await this.broker.refreshUserContext(this.id);
        await this.applyRefreshResult(result);
      } catch (err) {
        logger.warn({ msg: 'Failed to refresh user context', userId: this.id, err });
      }
    }

    // VIP
    this._vip = (doc?.['vip'] as Record<string, unknown>) ?? {};
  }

  private async applyRefreshResult(result: {
    context: Record<string, unknown> | null;
    profile: { summary: string; topics: Array<Record<string, unknown>>; tags: string[] } | null;
  }): Promise<void> {
    const { context, profile } = result;

    // Persist context to DB
    if (context) {
      const contextBuffer = { timestamp: new Date(), context };
      await this.broker.upsertUser(this.id, { context_buffer: contextBuffer });
      this._context = context;
    }

    // Ensure memory is loaded
    if (!this._memory) {
      this._memory = new Memory(this.id);
      await this._memory.fetch();
    }

    // Sync profile to ContextGraph and persist
    if (profile && (profile.summary || profile.topics.length > 0 || profile.tags.length > 0)) {
      const stats = syncProfile(this._memory.graph, profile);
      logger.info({ msg: 'Profile synced to context graph', userId: this.id, ...stats });
      await this._memory.save();
    }
  }
}
