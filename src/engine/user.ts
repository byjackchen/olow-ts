import { RequesterType as RT } from './types.js';
import { Memory } from './memory/index.js';
import type { Broker } from './broker.js';
import type { IUser } from './events.js';
import * as mongo from '../storage/mongo.js';
import logger from './logger.js';

// ─── User ───

export class User implements IUser {
  readonly type = RT.USER;
  readonly id: string;

  private _memory: Memory | null = null;
  private _context: Record<string, unknown> | null = null;
  private _vip: Record<string, unknown> | null = null;
  private broker: Broker;

  constructor(id: string, broker: Broker) {
    this.id = id;
    this.broker = broker;
  }

  async memory(): Promise<Memory> {
    if (!this._memory) {
      this._memory = new Memory(this.id);
      await this._memory.fetchMemory();
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

  private async loadAllInfo(): Promise<void> {
    const doc = await mongo.getUser(this.id);

    // Context
    if (doc?.['context_buffer']) {
      const buffer = doc['context_buffer'] as Record<string, unknown>;
      const timestamp = buffer['timestamp'] as Date | undefined;
      if (timestamp) {
        const cutoffMs = 259200 * 1000; // 3 days
        if (Date.now() - new Date(timestamp).getTime() < cutoffMs) {
          this._context = (buffer['context'] as Record<string, unknown>) ?? {};
        }
      }
    }

    // Memory
    if (!this._memory) {
      const memoryThreadsDoc = (doc?.['memory_threads'] as unknown[]) ?? [];
      this._memory = new Memory(this.id);
      await this._memory.fetchMemory(memoryThreadsDoc);
    }

    // VIP
    this._vip = (doc?.['vip'] as Record<string, unknown>) ?? {};
  }
}
