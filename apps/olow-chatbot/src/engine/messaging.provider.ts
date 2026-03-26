// ─── Messaging Provider (implements IMessagingProvider) ───

import type { IMessagingProvider } from '@olow/engine';
import * as wecomApi from '../services/wecom.api.js';
import type { TokenCache } from './token-cache.js';

async function withTokenRetry(tokenCache: TokenCache, fn: (token: string) => Promise<void>): Promise<void> {
  try {
    const token = await tokenCache.get();
    await fn(token);
  } catch (err) {
    if (err instanceof wecomApi.AccessTokenError) {
      await tokenCache.forceRefresh();
      const token = await tokenCache.get();
      await fn(token);
    } else {
      throw err;
    }
  }
}

export class MessagingProvider implements IMessagingProvider {
  constructor(private readonly tokenCache: TokenCache) {}

  async sendText(recipient: string, message: string): Promise<void> {
    await withTokenRetry(this.tokenCache, (token) => wecomApi.sendSingleText(token, recipient, message));
  }

  async sendRichText(recipient: string, content: string): Promise<void> {
    await withTokenRetry(this.tokenCache, (token) => wecomApi.sendSingleRichtext(token, recipient, content));
  }

  async sendGroupText(groupId: string, message: string): Promise<void> {
    const truncated = message.length > 5117 ? message.slice(0, 5117) + '\n...(truncated)' : message;
    await withTokenRetry(this.tokenCache, (token) => wecomApi.sendGroupText(token, groupId, truncated));
  }

  async sendFile(recipient: string, mediaId: string): Promise<void> {
    await withTokenRetry(this.tokenCache, (token) => wecomApi.sendSingleFile(token, recipient, mediaId));
  }

  async sendImage(recipient: string, mediaId: string): Promise<void> {
    await withTokenRetry(this.tokenCache, (token) => wecomApi.sendSingleImage(token, recipient, mediaId));
  }

  async createChatGroup(name: string, userList: string[]): Promise<string> {
    try {
      const token = await this.tokenCache.get();
      const resp = await wecomApi.createGroupChat(token, name, userList);
      return resp.chatid;
    } catch (err) {
      if (err instanceof wecomApi.AccessTokenError) {
        await this.tokenCache.forceRefresh();
        const token = await this.tokenCache.get();
        const resp = await wecomApi.createGroupChat(token, name, userList);
        return resp.chatid;
      }
      throw err;
    }
  }
}
