// ─── WeCom Messaging Provider (extracted from Broker) ───

import { MessengerType as MT, getLogger } from '@olow/engine';
import type { MessengerType, IMessagingProvider } from '@olow/engine';
import * as wecomApi from '../services/wecom.api.js';
import type { TokenCache } from './token-cache.js';

const logger = getLogger();

export class WeComMessagingProvider implements IMessagingProvider {
  constructor(private readonly tokenCache: TokenCache) {}

  private async withTokenRetry(fn: (token: string) => Promise<void>): Promise<void> {
    try {
      const token = await this.tokenCache.get();
      await fn(token);
    } catch (err) {
      if (err instanceof wecomApi.AccessTokenError) {
        await this.tokenCache.forceRefresh();
        const token = await this.tokenCache.get();
        await fn(token);
      } else {
        throw err;
      }
    }
  }

  async sendText(recipient: string, message: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      await this.withTokenRetry((token) => wecomApi.sendSingleText(token, recipient, message));
    } else {
      throw new Error(`sendText not implemented for messenger: ${messengerType}`);
    }
  }

  async sendRichText(recipient: string, content: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      await this.withTokenRetry((token) => wecomApi.sendSingleRichtext(token, recipient, content));
    } else {
      throw new Error(`sendRichText not implemented for messenger: ${messengerType}`);
    }
  }

  async sendGroupText(groupId: string, message: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      const truncated = message.length > 5117 ? message.slice(0, 5117) + '\n...(truncated)' : message;
      await this.withTokenRetry((token) => wecomApi.sendGroupText(token, groupId, truncated));
    } else {
      throw new Error(`sendGroupText not implemented for messenger: ${messengerType}`);
    }
  }

  async sendFile(recipient: string, mediaId: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      await this.withTokenRetry((token) => wecomApi.sendSingleFile(token, recipient, mediaId));
    }
  }

  async sendImage(recipient: string, mediaId: string, messengerType: MessengerType = MT.WECOM_BOT): Promise<void> {
    if (messengerType === MT.WECOM_BOT) {
      await this.withTokenRetry((token) => wecomApi.sendSingleImage(token, recipient, mediaId));
    }
  }

  async createChatGroup(name: string, userList: string[], messengerType: MessengerType = MT.WECOM_BOT): Promise<string> {
    if (messengerType !== MT.WECOM_BOT) throw new Error(`createChatGroup not implemented for: ${messengerType}`);
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
