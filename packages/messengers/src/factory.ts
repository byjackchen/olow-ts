import { MessengerType as MT } from '@olow/engine';
import type { MessengerType, IMessenger } from '@olow/engine';
import { WebBotMessenger } from './web-bot.messenger.js';
import { WeComMessenger, WeComGroupBotMessenger } from './wecom.messenger.js';
import { StubMessenger } from './stub.messenger.js';

export function createMessenger(type: MessengerType): IMessenger {
  switch (type) {
    case MT.WEB_BOT:
      return new WebBotMessenger();
    case MT.WECOM_BOT:
      return new WeComMessenger();
    case MT.WECOM_GROUPBOT:
      return new WeComGroupBotMessenger();
    case MT.SLACK_BOT:
      return new StubMessenger(type); // TODO: implement SlackMessenger
    case MT.BARE_TEXT:
      return new StubMessenger(type);
    default:
      throw new Error(`Unsupported messenger type: ${type}`);
  }
}
