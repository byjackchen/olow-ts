import { BaseFlow } from './base.flow.js';
import { EventType, EventStatus, ActionType, type MessengerType, FlowMsgType } from '../engine/types.js';
import { Event } from '../engine/events.js';
import { TextTemplate } from '../templates/text.template.js';
import { I18n } from '../templates/i18n.js';
import { registerFlow } from '../engine/dispatcher.js';
import { MemoryThreadName, type MemorySettings } from '../engine/memory/index.js';
import * as mongo from '../storage/mongo.js';
import { config } from '../config/index.js';
import logger from '../engine/logger.js';

export class GreetingFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.GREETING;
  }

  async run(): Promise<EventStatus> {
    const userId = this.request.requester.id;
    logger.info(`GreetingFlow for user ${userId}`);

    if (this.request.action === ActionType.ENTER_CHAT) {
      // Check VIP status and notify admin in background
      if ('vip' in this.request.requester) {
        this.dispatcher.backgroundTasks.push(this.notifyVip());
      }

      // Check SETTINGS memory for skip_greeting flag
      if ('memory' in this.request.requester) {
        const memory = await (this.request.requester as { memory: () => Promise<{ getThread: (name: string) => { memory: MemorySettings } | undefined; removeThread: (name: string) => void }> }).memory();
        const settingsThread = memory.getThread(MemoryThreadName.SETTINGS);
        if (settingsThread) {
          const skipGreeting = (settingsThread.memory as MemorySettings).info_maps['skip_greeting'];
          if (skipGreeting) {
            // Clear the flag and skip greeting
            delete (settingsThread.memory as MemorySettings).info_maps['skip_greeting'];
            return EventStatus.COMPLETE;
          }
        }
      }

      // Check greeting silent period — skip if user was recently greeted
      const silentSecs = config.engine.greeting_silent_seconds;
      try {
        const recentlyGreeted = await mongo.cyclesGetRespondedEnterChat(userId, silentSecs);
        if (recentlyGreeted) {
          logger.info(`User ${userId} was recently greeted, skipping`);
          return EventStatus.COMPLETE;
        }
      } catch {
        // DB not available — proceed with greeting
      }
    }

    // Append MENU event to show greeting menu
    this.dispatcher.eventchain.push(new Event(EventType.MENU));

    // Update user stats in background
    this.dispatcher.backgroundTasks.push(this.updateUserStats());

    return EventStatus.COMPLETE;
  }

  private async notifyVip(): Promise<void> {
    try {
      const adminGroupId = config.engine.admin_chatgroup_id;
      if (!adminGroupId) return;
      const now = new Date().toISOString();
      await this.broker.sendGroupText(
        adminGroupId,
        `[VIP] User ${this.request.requester.id} entered chat at ${now}`,
      );
    } catch (err) {
      logger.warn({ msg: 'Failed to notify VIP', err });
    }
  }

  private async updateUserStats(): Promise<void> {
    try {
      // TODO: Wire to broker.updateUserStats when implemented
      logger.debug(`Updating user stats for ${this.request.requester.id}`);
    } catch (err) {
      logger.warn({ msg: 'Failed to update user stats', err });
    }
  }
}
registerFlow(GreetingFlow);
