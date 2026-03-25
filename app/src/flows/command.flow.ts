import {
  BaseFlow, Event, flowRegistry, getLogger,
  CoreEventType, EventStatus, FlowMsgType,
  MemoryThreadName,
} from '@olow/engine';
import type { MessengerType, MemorySettings } from '@olow/engine';
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
        if ('memory' in this.request.requester) {
          const memory = await (this.request.requester as { memory: () => Promise<{ getThread: (name: string) => { memory: MemorySettings } | undefined; setThread: (name: string, memory: unknown) => void }> }).memory();
          const settingsThread = memory.getThread(MemoryThreadName.SETTINGS);
          if (settingsThread) {
            (settingsThread.memory as MemorySettings).info_maps['language'] = lang;
          } else {
            memory.setThread(MemoryThreadName.SETTINGS, { info_maps: { language: lang } });
          }
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
    } else if (cmd === '/help') {
      await this.event.propagateMsg(
        new TextTemplate(['Available commands:\n/menu - Show main menu\n/start - Show main menu\n/language cn|en - Set language\n/help - Show this help message']),
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
