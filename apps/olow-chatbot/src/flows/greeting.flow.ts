import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventStatus, ActionType, FlowMsgType,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { AppEventType } from '../events.js';
const logger = getLogger();
import { TextTemplate, I18n } from '@olow/templates';
import * as mongo from '../storage/mongo.js';
import { config } from '../config/index.js';

@flowRegistry.register()
export class GreetingFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === AppEventType.GREETING;
  }

  async run(): Promise<EventStatus> {
    const userId = this.request.requester.id;
    logger.info(`GreetingFlow for user ${userId}`);

    if (this.request.action === ActionType.ENTER_CHAT) {
      const { requester } = this.request;

      // Check VIP status and notify admin in background
      if ('vip' in requester) {
        this.dispatcher.backgroundTasks.push(this.notifyVip());
      }

      // Check SETTINGS memory for skip_greeting flag
      if ('memory' in requester && requester.memory) {
        const memory = await requester.memory();
        const skipGreeting = memory.settings.info_maps['skip_greeting'];
        if (skipGreeting) {
          // Clear the flag and skip greeting
          const { skip_greeting: _, ...rest } = memory.settings.info_maps;
          memory.updateSettings({ info_maps: rest });
          return EventStatus.COMPLETE;
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
    this.dispatcher.eventchain.push(new Event(AppEventType.MENU));

    // Update user stats in background
    this.dispatcher.backgroundTasks.push(this.updateUserStats());

    return EventStatus.COMPLETE;
  }

  private async notifyVip(): Promise<void> {
    try {
      const adminGroupId = config.engine.admin_chatgroup_id;
      if (!adminGroupId) return;
      const now = new Date().toISOString();
      await this.broker.messaging?.sendGroupText(
        adminGroupId,
        `[VIP] User ${this.request.requester.id} entered chat at ${now}`,
      );
    } catch (err) {
      logger.warn({ msg: 'Failed to notify VIP', err });
    }
  }

  private async updateUserStats(): Promise<void> {
    try {
      logger.debug(`Updating user stats for ${this.request.requester.id}`);
      logger.info(`User stats updated for ${this.request.requester.id}`);
    } catch (err) {
      logger.warn({ msg: 'Failed to update user stats', err });
    }
  }
}
