import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventStatus, FlowMsgType, MsgType,
} from '@olow/engine';
import type { MessengerType, ITemplate, Language } from '@olow/engine';
import { ReactEventType } from './events.js';
import { navigatePrompt } from './prompts.js';
import { templateRegistry } from '@olow/engine';

const logger = getLogger();

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

/**
 * Runs in parallel with REACT_PLAN (spawned from REACT_PRECALL for web portal sites).
 * Fetches navigation targets, uses LLM to match user intent to a URL, emits NAVIGATE message.
 *
 * App layer can:
 * - Override navigation target fetching by extending this flow
 * - Provide a custom navigation API endpoint via config
 */
@flowRegistry.register()
export class ReactNavigateFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === ReactEventType.REACT_NAVIGATE;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactNavigateFlow for site ${this.request.site}`);

    // Get user intent from react states
    const chain = this.dispatcher.states.react.process_chain;
    const lastQuestion = chain.findLast((e: Record<string, unknown>) => e['type'] === 'question');
    const intent = (lastQuestion?.['question'] as string) ?? this.request.content.mixedText;

    if (!intent) {
      logger.warn('ReactNavigateFlow: no intent found, skipping');
      return EventStatus.COMPLETE;
    }

    // Fetch navigation targets — app can override by providing nav items in states
    const navItems = (this.dispatcher.states as Record<string, unknown>)['nav_items'] as
      Array<{ url: string; title: string }> | undefined;

    if (!navItems || navItems.length === 0) {
      logger.info('ReactNavigateFlow: no navigation items available, skipping');
      return EventStatus.COMPLETE;
    }

    // Build prompt and call LLM
    const prompt = navigatePrompt(intent, navItems);
    const [success, result] = await this.broker.llm.callLlm(prompt, { jsonMode: 'json_fence' });

    if (!success || !result || typeof result !== 'object') {
      logger.warn('ReactNavigateFlow: LLM call failed or returned invalid response');
      return EventStatus.COMPLETE;
    }

    const parsed = result as Record<string, unknown>;
    const selectedUrl = (parsed['url'] as string) ?? '';
    const label = (parsed['label'] as string) ?? '';

    if (!selectedUrl) {
      logger.info('ReactNavigateFlow: no matching navigation target');
      return EventStatus.COMPLETE;
    }

    // Parse URL into path + query
    let path = selectedUrl;
    let query: Record<string, unknown> = {};
    const qIdx = selectedUrl.indexOf('?');
    if (qIdx !== -1) {
      path = selectedUrl.slice(0, qIdx);
      const params = new URLSearchParams(selectedUrl.slice(qIdx + 1));
      for (const [k, v] of params) {
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
