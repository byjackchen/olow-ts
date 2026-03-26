import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { getLogger, UserIdType as UIT } from '@olow/engine';
import type { UserIdType, IBroker, ILlmProvider, IMessagingProvider, CycleCreateParams, CycleUpdateParams } from '@olow/engine';
import * as mongo from '../storage/mongo.js';
import * as wecomApi from '../services/wecom.api.js';
import * as workdayApi from '../services/workday.api.js';
import * as itawareApi from '../services/itaware.api.js';
import { getUserRtx } from '../services/slack.api.js';
import { TokenCache } from './token-cache.js';
import { LlmProvider } from './llm.provider.js';
import { UserContextProvider } from './user-context.provider.js';

const logger = getLogger();

// ─── Broker (composition root) ───

export class Broker implements IBroker {
  private static instance: Broker | null = null;

  readonly redis: Redis;

  // Token caches
  readonly wecomBotTokenCache: TokenCache;
  private readonly workdayTokenCache: TokenCache;
  private readonly itawareTokenCache: TokenCache;

  // Sub-providers
  private readonly _llm: LlmProvider;
  private _messaging?: IMessagingProvider;
  private readonly _userContext: UserContextProvider;

  // Token rotation
  private _tokenIndex = 0;

  private constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    // Shared helpers for token persistence
    const getBuffer = (name: string) => this.getSystemTokenBuffer(name);
    const persist = (name: string, resp: { access_token: string; expires_in: number }) =>
      this.updateSystemToken(name, resp);

    this.wecomBotTokenCache = new TokenCache(
      'WeCom_Bot',
      () => wecomApi.getToken(config.wecom_bot.corp_id, config.wecom_bot.corp_secret),
      getBuffer, persist,
    );
    this.workdayTokenCache = new TokenCache(
      'Workday', () => workdayApi.getAuthToken(), getBuffer, persist,
    );
    this.itawareTokenCache = new TokenCache(
      'ITAware', () => itawareApi.getAuthToken(), getBuffer, persist,
    );

    this._llm = new LlmProvider(() => this.getRotatedToken());
    this._userContext = new UserContextProvider(this.workdayTokenCache, this.itawareTokenCache);
  }

  static getInstance(): Broker {
    if (!Broker.instance) {
      Broker.instance = new Broker();
    }
    return Broker.instance;
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Redis connected');
    } catch (err) {
      logger.warn({ msg: 'Redis connection failed (non-fatal)', err });
    }
    try {
      await mongo.initDatabase();
    } catch (err) {
      logger.warn({ msg: 'MongoDB connection failed (non-fatal)', err });
    }
  }

  async shutdown(): Promise<void> {
    this.redis.disconnect();
    await mongo.closeDatabase();
  }

  // ─── IBroker Sub-Providers ───

  get llm(): ILlmProvider {
    return this._llm;
  }

  get messaging(): IMessagingProvider | undefined {
    return this._messaging;
  }

  setMessagingProvider(provider: IMessagingProvider): void {
    this._messaging = provider;
  }

  // ─── IBroker Storage Delegates ───

  async getUser(userId: string): Promise<Record<string, unknown> | null> {
    return mongo.getUser(userId) as Promise<Record<string, unknown> | null>;
  }

  async upsertUser(userId: string, data: Record<string, unknown>): Promise<void> {
    return mongo.upsertUser(userId, data);
  }

  async getSystem(name: string): Promise<Record<string, unknown> | null> {
    return mongo.getSystem(name) as Promise<Record<string, unknown> | null>;
  }

  async upsertSystem(name: string, data: Record<string, unknown>): Promise<void> {
    return mongo.upsertSystem(name, data as { token: string; expiretime: Date });
  }

  // ─── Token Persistence Helpers (used by TokenCache) ───

  private async getSystemTokenBuffer(sysName: string): Promise<{ token: string; expiry: Date } | null> {
    const doc = await mongo.getSystem(sysName);
    if (!doc) return null;
    const buffer = doc['token_buffer'] as { token?: string; expiretime?: Date } | undefined;
    if (!buffer?.token || !buffer?.expiretime) return null;
    if (new Date(buffer.expiretime) <= new Date()) return null;
    return { token: buffer.token, expiry: new Date(buffer.expiretime) };
  }

  private async updateSystemToken(
    sysName: string,
    tokenResponse: { access_token: string; expires_in: number },
  ): Promise<{ token: string; expiry: Date }> {
    const expiry = new Date(
      Date.now() + (tokenResponse.expires_in - config.broker.expiretime_offset_seconds) * 1000,
    );
    await mongo.upsertSystem(sysName, { token: tokenResponse.access_token, expiretime: expiry });
    return { token: tokenResponse.access_token, expiry };
  }

  // ─── Context + Profile Refresh ───

  async refreshUserContext(
    userId: string,
    proxyUserId?: string,
  ): Promise<{
    context: Record<string, unknown> | null;
    profile: { summary: string; topics: Array<Record<string, unknown>>; tags: string[] } | null;
  }> {
    return this._userContext.refresh(userId, proxyUserId);
  }

  // ─── User ID Resolution ───

  async getUserId(userIdType: UserIdType, nonStdUserId: string): Promise<string> {
    if (userIdType === UIT.WECOM) {
      const doc = await mongo.getUserByWecomUserid(nonStdUserId);
      if (doc?.['user']) return doc['user'] as string;
    } else if (userIdType === UIT.SLACK) {
      const doc = await mongo.getUserBySlackUserid(nonStdUserId);
      if (doc?.['user']) return doc['user'] as string;
    }

    let rtx: string;
    if (userIdType === UIT.WECOM) {
      const token = await this.wecomBotTokenCache.get();
      const resp = await wecomApi.getRtx(token, nonStdUserId);
      rtx = resp.user_list[0]?.['name'] ?? nonStdUserId;
      await mongo.upsertUser(rtx, { wecomUserid: nonStdUserId });
    } else if (userIdType === UIT.SLACK) {
      rtx = await getUserRtx(null, nonStdUserId);
      await mongo.upsertUser(rtx, { slackUserid: nonStdUserId });
    } else {
      rtx = nonStdUserId;
    }
    return rtx;
  }

  // ─── MongoDB Wrappers ───

  async cyclesCreate(params: CycleCreateParams): Promise<string> {
    return mongo.cyclesCreate(params);
  }

  async cyclesUpdate(id: string, update: CycleUpdateParams): Promise<void> {
    return mongo.cyclesUpdate(id, update);
  }

  async cyclesGetOneById(id: string): Promise<Record<string, unknown> | null> {
    return mongo.cyclesGetOneById(id) as Promise<Record<string, unknown> | null>;
  }

  // ─── Peak Shaving (Redis) ───

  async getPeakShavingCount(): Promise<number> {
    const key = config.redis.keys.peak_shaving;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  async incrementPeakShaving(ttlSeconds = 60): Promise<number> {
    const key = config.redis.keys.peak_shaving;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    return count;
  }

  // ─── Token Rotation ───

  private getRotatedToken(): string {
    const tokens = config.hyaide.llm_tokens;
    if (tokens.length === 0) throw new Error('No Hyaide LLM tokens configured');
    return tokens[this._tokenIndex++ % tokens.length]!;
  }
}
