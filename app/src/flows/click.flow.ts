import {
  BaseFlow, Event, flowRegistry, getLogger,
  CoreEventType, EventStatus, FlowMsgType, ACTION_CHAIN_ROOT_KEY,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { AppEventType } from '../events.js';
const logger = getLogger();
import { TextTemplate, I18n } from '@olow/messengers';
import * as mongo from '../storage/mongo.js';

@flowRegistry.register()
export class ClickFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === AppEventType.CLICK;
  }

  async run(): Promise<EventStatus> {
    const [valid, key, cycleId] = await this.dispatcher.validateClick();
    if (!valid) {
      logger.info(`Click validation failed for key: ${key}`);
      return EventStatus.COMPLETE;
    }

    logger.info(`ClickFlow handling key=${key}, cycleId=${cycleId}`);

    // Greeting
    if (key === 'greeting') {
      this.dispatcher.eventchain.push(new Event(AppEventType.GREETING));
      return EventStatus.COMPLETE;
    }

    // Menu
    if (key.startsWith('menu-')) {
      this.dispatcher.eventchain.push(new Event(AppEventType.MENU));
      return EventStatus.COMPLETE;
    }

    // Agent support
    if (key === 'agentsupport') {
      await this.event.propagateMsg(new TextTemplate([I18n.AGENT_SUPPORT_CONFIRM]));
      this.dispatcher.eventchain.push(new Event(CoreEventType.ANALYSIS));
      return EventStatus.COMPLETE;
    }
    if (key === 'agentsupport-confirm') {
      this.dispatcher.eventchain.push(new Event(AppEventType.AGENT_SUPPORT));
      return EventStatus.COMPLETE;
    }

    // FAQ expansion
    if (key.startsWith('faq-')) {
      this.dispatcher.eventchain.push(new Event(AppEventType.EXPAND_FAQ));
      return EventStatus.COMPLETE;
    }

    // Helpfulness feedback
    if (key.startsWith('helpful-') && cycleId) {
      const isHelpful = key === 'helpful-yes';
      try { await mongo.cyclesUpdate(cycleId, { isHelpful }); } catch { /* non-fatal */ }
      await this.event.propagateMsg(new TextTemplate([I18n.GENERAL_FEEDBACK_CONFIRM]));
      if (key === 'helpful-no-faq') {
        this.dispatcher.backgroundTasks.push(this.trackFaqHelpfulness(cycleId));
      }
      return EventStatus.COMPLETE;
    }

    // Ticket follow-up
    if (key.startsWith('ticketfollowup:')) {
      const ticketId = key.replace('ticketfollowup:', '');
      logger.info(`Ticket follow-up for ${ticketId}`);
      await this.event.propagateMsg(new TextTemplate([`Follow-up submitted for ticket ${ticketId}`]));
      return EventStatus.COMPLETE;
    }

    // Settings (language, etc.) — e.g. settings-language-cn
    if (key.startsWith('settings-')) {
      const parts = key.split('-');
      const { requester } = this.request;
      if (parts.length >= 3 && parts[1] === 'language' && 'memory' in requester && requester.memory) {
        const lang = parts.slice(2).join('-');
        try {
          const mem = await requester.memory();
          mem.updateSettings({ info_maps: { ...mem.settings.info_maps, language: lang } });
        } catch { /* non-fatal */ }
      }
      this.dispatcher.eventchain.push(new Event(AppEventType.MENU));
      return EventStatus.COMPLETE;
    }

    // User details
    if (key === 'userdetails') {
      this.dispatcher.eventchain.push(new Event(AppEventType.USER_DETAILS));
      return EventStatus.COMPLETE;
    }

    // ActionChain buttons
    if (key.startsWith(ACTION_CHAIN_ROOT_KEY)) {
      const mainKey = key.split('-').slice(0, 2).join('-');
      if (this.dispatcher.actionchainsMap.has(mainKey)) {
        this.dispatcher.states.actionchain = { main_key: mainKey };
        this.dispatcher.eventchain.push(new Event(CoreEventType.ACTION_CHAIN));
        return EventStatus.COMPLETE;
      }
    }

    // Unknown click
    logger.warn(`Unknown click key: ${key}`);
    this.dispatcher.eventchain.push(new Event(CoreEventType.UNKNOWN));
    return EventStatus.COMPLETE;
  }

  private async trackFaqHelpfulness(cycleId: string): Promise<void> {
    try {
      const cycle = await mongo.cyclesGetOneById(cycleId);
      const shownFaqs = (cycle?.['shown_faqs'] as unknown[]) ?? [];
      logger.info({ msg: 'Tracking FAQ helpfulness', cycleId, faqCount: shownFaqs.length });
    } catch (err) {
      logger.warn({ msg: 'Failed to track FAQ helpfulness', err });
    }
  }
}
