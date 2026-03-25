import { Redis } from 'ioredis';
import { config, type Config } from '../config/index.js';
import { getLogger } from '@olow/engine';
const logger = getLogger();
import * as mongo from '../storage/mongo.js';
import * as wecomApi from '../services/wecom.api.js';
import * as openaiApi from '../services/openai.api.js';
import { callHyaideLlm } from '../services/hyaide.api.js';
import { getUserRtx } from '../services/slack.api.js';
import { MessengerType as MT } from '@olow/engine';
import type { MessengerType, UserIdType, IBroker, ILlmProvider, IMessagingProvider, CycleCreateParams, CycleUpdateParams } from '@olow/engine';
import { UserIdType as UIT } from '@olow/engine';

// ─── Broker ───

export class Broker implements IBroker {
  private static instance: Broker | null = null;

  readonly redis: Redis;

  // Token caches
  private wecomBotToken: string | null = null;
  private wecomBotTokenExpiry: Date | null = null;
  private wecomGroupbotToken: string | null = null;
  private wecomGroupbotTokenExpiry: Date | null = null;
  private workdayToken: string | null = null;
  private workdayTokenExpiry: Date | null = null;

  private constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) return null; // Stop retrying
        return Math.min(times * 200, 2000);
      },
    });
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
    return {
      callLlm: (message, opts) => this.callLlm(message, opts),
      callLlmStream: (message, msgQueue, opts) => this.callLlmStream(message, msgQueue, opts),
    };
  }

  get messaging(): IMessagingProvider {
    return {
      sendText: (recipient, message) => this.sendSingleText(recipient, message),
      sendRichText: (recipient, content) => this.sendSingleRichtext(recipient, content),
      sendGroupText: (groupId, message) => this.sendGroupText(groupId, message),
      sendFile: (recipient, mediaId) => this.sendSingleFile(recipient, mediaId),
      sendImage: (recipient, mediaId) => this.sendSingleImage(recipient, mediaId),
      createChatGroup: (name, userList) => this.createChatGroup(name, userList),
    };
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

  // ─── Token Management ───

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

  async getWecomBotToken(): Promise<string> {
    // 1. Memory cache
    if (this.wecomBotToken && this.wecomBotTokenExpiry && this.wecomBotTokenExpiry > new Date()) {
      return this.wecomBotToken;
    }
    // 2. DB cache
    const cached = await this.getSystemTokenBuffer('WeCom_Bot');
    if (cached) {
      this.wecomBotToken = cached.token;
      this.wecomBotTokenExpiry = cached.expiry;
      return cached.token;
    }
    // 3. Refresh
    const resp = await wecomApi.getToken(config.wecom_bot.corp_id, config.wecom_bot.corp_secret);
    const result = await this.updateSystemToken('WeCom_Bot', resp);
    this.wecomBotToken = result.token;
    this.wecomBotTokenExpiry = result.expiry;
    return result.token;
  }

  async wecomBotTokenForceRefresh(): Promise<void> {
    const resp = await wecomApi.getToken(config.wecom_bot.corp_id, config.wecom_bot.corp_secret);
    const result = await this.updateSystemToken('WeCom_Bot', resp);
    this.wecomBotToken = result.token;
    this.wecomBotTokenExpiry = result.expiry;
  }

  async getWecomGroupbotToken(): Promise<string> {
    if (this.wecomGroupbotToken && this.wecomGroupbotTokenExpiry && this.wecomGroupbotTokenExpiry > new Date()) {
      return this.wecomGroupbotToken;
    }
    const cached = await this.getSystemTokenBuffer('WeCom_GroupBot');
    if (cached) {
      this.wecomGroupbotToken = cached.token;
      this.wecomGroupbotTokenExpiry = cached.expiry;
      return cached.token;
    }
    // GroupBot uses same corp_id but different config — placeholder for real config
    const resp = await wecomApi.getToken(config.wecom_bot.corp_id, config.wecom_bot.corp_secret);
    const result = await this.updateSystemToken('WeCom_GroupBot', resp);
    this.wecomGroupbotToken = result.token;
    this.wecomGroupbotTokenExpiry = result.expiry;
    return result.token;
  }

  // ─── Send Messages (high-level) ───

  private async withTokenRetry(
    getToken: () => Promise<string>,
    forceRefresh: () => Promise<void>,
    fn: (token: string) => Promise<void>,
  ): Promise<void> {
    try {
      const token = await getToken();
      await fn(token);
    } catch (err) {
      if (err instanceof wecomApi.AccessTokenError) {
        await forceRefresh();
        const token = await getToken();
        await fn(token);
      } else {
        throw err;
      }
    }
  }

  async sendSingleText(rtx: string, msg: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      await this.withTokenRetry(
        () => this.getWecomBotToken(),
        () => this.wecomBotTokenForceRefresh(),
        (token) => wecomApi.sendSingleText(token, rtx, msg),
      );
    } else {
      throw new Error(`sendSingleText not implemented for messenger: ${messengerType}`);
    }
  }

  async sendSingleRichtext(rtx: string, msg: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      await this.withTokenRetry(
        () => this.getWecomBotToken(),
        () => this.wecomBotTokenForceRefresh(),
        (token) => wecomApi.sendSingleRichtext(token, rtx, msg),
      );
    } else {
      throw new Error(`sendSingleRichtext not implemented for messenger: ${messengerType}`);
    }
  }

  async sendGroupText(groupId: string, msg: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      const truncated = msg.length > 5117 ? msg.slice(0, 5117) + '\n...(truncated)' : msg;
      await this.withTokenRetry(
        () => this.getWecomBotToken(),
        () => this.wecomBotTokenForceRefresh(),
        (token) => wecomApi.sendGroupText(token, groupId, truncated),
      );
    } else {
      throw new Error(`sendGroupText not implemented for messenger: ${messengerType}`);
    }
  }

  // ─── File Operations ───

  async sendSingleFile(rtx: string, mediaId: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      await this.withTokenRetry(
        () => this.getWecomBotToken(),
        () => this.wecomBotTokenForceRefresh(),
        (token) => wecomApi.sendSingleFile(token, rtx, mediaId),
      );
    }
  }

  async sendSingleImage(rtx: string, mediaId: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      await this.withTokenRetry(
        () => this.getWecomBotToken(),
        () => this.wecomBotTokenForceRefresh(),
        (token) => wecomApi.sendSingleImage(token, rtx, mediaId),
      );
    }
  }

  // ─── User ID Resolution ───

  async getUserId(userIdType: UserIdType, nonStdUserId: string): Promise<string> {
    // 1. DB lookup
    if (userIdType === UIT.WECOM) {
      const doc = await mongo.getUserByWecomUserid(nonStdUserId);
      if (doc?.['user']) return doc['user'] as string;
    } else if (userIdType === UIT.SLACK) {
      const doc = await mongo.getUserBySlackUserid(nonStdUserId);
      if (doc?.['user']) return doc['user'] as string;
    }

    // 2. Remote service lookup
    let rtx: string;
    if (userIdType === UIT.WECOM) {
      const token = await this.getWecomBotToken();
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

  // ─── Group Management ───

  async createChatGroup(name: string, userList: string[], messengerType: MessengerType = MT.WECOM_BOT): Promise<string> {
    if (messengerType !== MT.WECOM_BOT) throw new Error(`createChatGroup not implemented for: ${messengerType}`);
    let groupId: string;
    try {
      const token = await this.getWecomBotToken();
      const resp = await wecomApi.createGroupChat(token, name, userList);
      groupId = resp.chatid;
    } catch (err) {
      if (err instanceof wecomApi.AccessTokenError) {
        await this.wecomBotTokenForceRefresh();
        const token = await this.getWecomBotToken();
        const resp = await wecomApi.createGroupChat(token, name, userList);
        groupId = resp.chatid;
      } else throw err;
    }
    return groupId;
  }

  // ─── LLM Calls ───

  async callLlm(
    message: string,
    opts?: {
      jsonMode?: 'string' | 'json' | 'json_fence';
      provider?: string;
      model?: string;
    },
  ): Promise<[success: boolean, result: string | Record<string, unknown> | null]> {
    const provider = opts?.provider ?? config.engine.base_llm_provider;
    const model = opts?.model ?? config.engine.base_llm_model;
    const jsonMode = opts?.jsonMode ?? 'string';

    let respStr: string;

    if (provider === 'openai') {
      const resp = await openaiApi.callChatCompletions(message, { model });
      respStr = resp.choices[0]?.message.content ?? '';
    } else if (provider === 'hyaide') {
      const token = this.getRotatedToken();
      const resp = await callHyaideLlm(token, message, model);
      respStr = resp.choices[0]?.message.content ?? '';
    } else {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    return this.parseLlmResponse(respStr, jsonMode);
  }

  async callLlmStream(
    message: string,
    msgQueue: { put: (msg: unknown) => Promise<void> },
    opts?: {
      jsonMode?: 'string' | 'json' | 'json_fence';
      provider?: string;
      model?: string;
    },
  ): Promise<[success: boolean, result: string | Record<string, unknown> | null]> {
    const { StructuralStreamParser, Section } = await import('@olow/engine');

    const provider = opts?.provider ?? config.engine.base_llm_provider;
    const model = opts?.model ?? config.engine.base_llm_model;
    const jsonMode = opts?.jsonMode ?? 'string';

    const fullTokens: string[] = [];
    const parser = new StructuralStreamParser();
    let lastEmitted: string | null = null;

    const emit = async (msgType: string, delta: string, isComplete: boolean) => {
      if (!isComplete && lastEmitted && lastEmitted !== msgType) {
        await msgQueue.put({ messageType: lastEmitted, delta: '', isComplete: true });
      }
      lastEmitted = isComplete ? null : msgType;
      await msgQueue.put({ messageType: msgType, delta, isComplete });
    };

    // Reasoning field extractor — detects "reasoning": " in streaming JSON
    // and emits only the value content as think_l3 deltas
    let contentBuf = '';
    const REASONING_START = '"thought":';
    let inReasoning = false;
    let reasoningQuoteDepth = 0; // track escaped quotes

    const flushContentToken = async (token: string) => {
      contentBuf += token;

      if (!inReasoning) {
        // Look for "reasoning": in the buffer
        const idx = contentBuf.indexOf(REASONING_START);
        if (idx === -1) return;

        // Found start — skip to the opening quote of the value
        let rest = contentBuf.slice(idx + REASONING_START.length).trimStart();
        if (!rest.startsWith('"')) {
          // Haven't received the opening quote yet, keep buffering
          return;
        }
        rest = rest.slice(1); // skip opening "
        inReasoning = true;
        contentBuf = rest;
      }

      if (inReasoning) {
        // Stream content until unescaped closing "
        let i = 0;
        while (i < contentBuf.length) {
          if (contentBuf[i] === '\\' && i + 1 < contentBuf.length) {
            // Escaped char — emit the actual char
            const escaped = contentBuf[i + 1];
            const actual = escaped === 'n' ? '\n' : escaped === 't' ? '\t' : (escaped ?? '');
            await emit('think_l3', actual, false);
            i += 2;
          } else if (contentBuf[i] === '"') {
            // End of reasoning value
            inReasoning = false;
            await emit('think_l3', '', true);
            contentBuf = '';
            return;
          } else {
            await emit('think_l3', contentBuf[i]!, false);
            i++;
          }
        }
        contentBuf = ''; // all consumed
      }
    };

    let streamGen: AsyncGenerator<[type: 'reasoning' | 'content' | 'done', token: string]>;
    if (provider === 'openai') {
      streamGen = openaiApi.streamChatCompletions(message, { model });
    } else if (provider === 'hyaide') {
      const token = this.getRotatedToken();
      const { streamHyaideLlm } = await import('../services/hyaide.api.js');
      streamGen = streamHyaideLlm(token, message, model);
    } else {
      throw new Error(`Streaming not implemented for provider: ${provider}`);
    }

    for await (const [type, token] of streamGen) {
      if (type === 'done') {
        if (lastEmitted) {
          await emit(lastEmitted, '', true);
        }
        break;
      }

      if (type === 'reasoning') {
        // DeepSeek thinking tokens → think_l2
        await emit('think_l2', token, false);
        continue;
      }

      if (type === 'content') {
        fullTokens.push(token);

        // Also run through structural parser for <think> tags
        const results = parser.feed(token);
        let hasStructural = false;
        for (const [section, text] of results) {
          if (section === Section.THINK_L3) {
            hasStructural = true;
            await emit('think_l3', text, false);
          } else if (section === Section.ANSWER) {
            // For answer section: extract reasoning field, suppress the rest
            await flushContentToken(text);
          }
          // ACTION/RAW sections: silently suppressed
        }
        if (!hasStructural && results.length === 0) {
          await flushContentToken(token);
        }
      }
    }

    const fullText = fullTokens.join('');
    return this.parseLlmResponse(fullText, jsonMode);
  }

  private parseLlmResponse(
    text: string,
    jsonMode: 'string' | 'json' | 'json_fence',
  ): [boolean, string | Record<string, unknown> | null] {
    if (jsonMode === 'string') {
      return [true, text];
    }

    let candidate = text;
    if (jsonMode === 'json_fence') {
      const fencePattern = /```(?:json|jsonc)?\s*([\[{](?:(?!```)[\s\S])*?[}\]])\s*```/i;
      const match = fencePattern.exec(text);
      candidate = match?.[1] ?? text;
    }

    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      return [true, parsed];
    } catch {
      logger.error({ msg: 'Failed to parse JSON from LLM response', text: candidate.slice(0, 200) });
      return [false, null];
    }
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

  // ─── Token Rotation (Redis) ───

  getRotatedToken(): string {
    const tokens = config.hyaide.llm_tokens;
    if (tokens.length === 0) throw new Error('No Hyaide LLM tokens configured');

    // Synchronous rotation via Redis (fire-and-forget for increment)
    const key = config.redis.keys.taiji_rotation;
    let index = 0;
    try {
      // We use a simple counter approach
      const current = this.redis.get(key);
      // Since Redis ops are async but we need sync, use a rotating counter
      index = Math.floor(Math.random() * tokens.length);
    } catch {
      index = 0;
    }

    return tokens[index % tokens.length] ?? tokens[0]!;
  }
}
