import {
  BaseFlow, Event, flowRegistry, getLogger,
  CoreEventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { AppEventType } from '../events.js';
const logger = getLogger();
import { TextTemplate } from '@olow/templates';

@flowRegistry.register()
export class CommandFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === CoreEventType.COMMAND;
  }

  async run(): Promise<EventStatus> {
    const userId = this.request.requester.id;
    const commandText = this.request.content.mixedText.trim();
    logger.info(`CommandFlow handling command "${commandText}" for user ${userId}`);

    const parts = commandText.split(/\s+/);
    const cmd = parts[0]?.toLowerCase() ?? '';

    if (cmd === '/menu' || cmd === '/start') {
      this.dispatcher.eventchain.push(new Event(AppEventType.MENU));
    } else if (cmd === '/language') {
      const lang = parts[1]?.toLowerCase();
      if (lang === 'cn' || lang === 'en') {
        // Update settings memory language
        const { requester } = this.request;
        if ('memory' in requester && requester.memory) {
          const mem = await requester.memory();
          mem.updateSettings({ info_maps: { ...mem.settings.info_maps, language: lang } });
        }
        this.dispatcher.eventchain.push(new Event(AppEventType.MENU));
      } else {
        await this.event.propagateMsg(
          new TextTemplate(['Usage: /language cn or /language en']),
          undefined,
          undefined,
          FlowMsgType.ANSWER,
        );
      }
    } else if (cmd === '/proxy') {
      const proxyRtx = parts[1]?.toLowerCase();
      const proxyRequester = this.request.requester;
      if (proxyRtx && 'refreshContext' in proxyRequester && proxyRequester.refreshContext) {
        const target = proxyRtx === '--remove' ? undefined : proxyRtx;
        await proxyRequester.refreshContext(target);
        const msg = target
          ? `Context refreshed with proxy: ${target}`
          : 'Proxy removed, context refreshed with own identity';
        await this.event.propagateMsg(new TextTemplate([msg]), undefined, undefined, FlowMsgType.ANSWER);
      } else {
        await this.event.propagateMsg(
          new TextTemplate(['Usage: /proxy <rtx> or /proxy --remove']),
          undefined, undefined, FlowMsgType.ANSWER,
        );
      }
    } else if (cmd === '/help') {
      await this.event.propagateMsg(
        new TextTemplate(['Available commands:\n/menu - Show main menu\n/start - Show main menu\n/language cn|en - Set language\n/proxy <rtx> - Refresh context as another user\n/help - Show this help message']),
        undefined,
        undefined,
        FlowMsgType.ANSWER,
      );
    } else {
      await this.event.propagateMsg(
        new TextTemplate([`Unknown command: ${cmd}`]),
        undefined,
        undefined,
        FlowMsgType.ANSWER,
      );
    }

    return EventStatus.COMPLETE;
  }
}
