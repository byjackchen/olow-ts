import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventStatus, FlowMsgType, MsgType,
} from '@olow/engine';
import type { MessengerType, ITemplate, Language } from '@olow/engine';
import { ReactEventType } from './events.js';
import { navigatePrompt } from './prompts.js';
import { templateRegistry } from '@olow/engine';

const logger = getLogger();

// ─── Navigate Config ───

export interface NavItem {
  url: string;
  title: string;
}

// Default navigation items (demo/sample — app can override via setNavItems)
let _navItems: NavItem[] = [
  { url: '/request', title: 'My Requests' },
  { url: '/request/new', title: 'Submit New Request' },
  { url: '/hardware', title: 'Hardware Asset Management' },
  { url: '/hardware/apply', title: 'Apply for Hardware' },
  { url: '/software', title: 'Software Center' },
  { url: '/wifi', title: 'WiFi & Network Settings' },
  { url: '/wifi/guest', title: 'Guest WiFi Access' },
  { url: '/account', title: 'Account & Password Management' },
  { url: '/account/reset', title: 'Reset Password' },
  { url: '/faq', title: 'FAQ / Knowledge Base' },
  { url: '/ticket', title: 'My Tickets' },
  { url: '/ticket/new', title: 'Create Support Ticket' },
];

/** Override navigation items (call at app startup if needed). */
export function setNavItems(items: NavItem[]): void {
  _navItems = items;
}

export function getNavItems(): NavItem[] {
  return _navItems;
}

// ─── Navigate Template ───

@templateRegistry.register({ name: 'AiNavigateTemplate' })
export class AiNavigateTemplate implements ITemplate {
  lang?: Language;
  private path: string;
  private query: Record<string, unknown>;
  private label: string;

  constructor(opts: { path: string; query?: Record<string, unknown>; label?: string; lang?: Language }) {
    this.path = opts.path;
    this.query = opts.query ?? {};
    this.label = opts.label ?? '';
    this.lang = opts.lang;
  }

  render(_messengerType: MessengerType): [typeof MsgType.JSON, unknown] {
    return [MsgType.JSON, { path: this.path, query: this.query, label: this.label }];
  }

  toData(): Record<string, unknown> {
    return { path: this.path, query: this.query, label: this.label };
  }
}

// ─── Navigate Flow ───

@flowRegistry.register()
export class ReactNavigateFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === ReactEventType.REACT_NAVIGATE;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactNavigateFlow for site ${this.request.site}`);

    const chain = this.dispatcher.states.react.process_chain;
    const lastQuestion = chain.findLast((e: Record<string, unknown>) => e['type'] === 'question');
    const intent = (lastQuestion?.['question'] as string) ?? this.request.content.mixedText;

    if (!intent) {
      logger.warn('ReactNavigateFlow: no intent found, skipping');
      return EventStatus.COMPLETE;
    }

    // Use configured nav items, or fall back to states
    const navItems = _navItems.length > 0
      ? _navItems
      : ((this.dispatcher.states as Record<string, unknown>)['nav_items'] as NavItem[] | undefined) ?? [];

    if (navItems.length === 0) {
      logger.info('ReactNavigateFlow: no navigation items available, skipping');
      return EventStatus.COMPLETE;
    }

    const prompt = navigatePrompt(intent, navItems);
    const [success, result] = await this.broker.llm.callLlm(prompt, { jsonMode: 'json_fence' });

    if (!success || !result || typeof result !== 'object') {
      logger.warn('ReactNavigateFlow: LLM call failed');
      return EventStatus.COMPLETE;
    }

    const parsed = result as Record<string, unknown>;
    const selectedUrl = (parsed['url'] as string) ?? '';
    const label = (parsed['label'] as string) ?? '';

    if (!selectedUrl) {
      logger.info('ReactNavigateFlow: no matching navigation target');
      return EventStatus.COMPLETE;
    }

    let path = selectedUrl;
    let query: Record<string, unknown> = {};
    const qIdx = selectedUrl.indexOf('?');
    if (qIdx !== -1) {
      path = selectedUrl.slice(0, qIdx);
      for (const [k, v] of new URLSearchParams(selectedUrl.slice(qIdx + 1))) {
        query[k] = v;
      }
    }

    logger.info(`ReactNavigateFlow: path=${path}, label=${label}`);

    await this.event.propagateMsg(
      new AiNavigateTemplate({ path, query, label }),
      undefined, undefined, FlowMsgType.NAVIGATE,
    );

    return EventStatus.COMPLETE;
  }
}
