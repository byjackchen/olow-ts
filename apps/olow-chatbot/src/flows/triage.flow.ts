import {
  BaseFlow, Event, Request, flowRegistry, getLogger,
  CoreEventType, EventStatus, ActionType, FlowMsgType,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { AppEventType } from '../events.js';
import { ReactEventType } from '@olow/agent-flows';
const logger = getLogger();
import { TextTemplate, AgentSupportConfirmTemplate, I18n } from '@olow/templates';
import { config } from '../config/index.js';

// ─── Similarity Words ───

interface SimilarityEntry {
  maxDistance: number;
  category: 'greeting' | 'agentsupport';
}

const SIMILARITY_WORDS: Record<string, SimilarityEntry> = {
  hi: { maxDistance: 0, category: 'greeting' },
  hello: { maxDistance: 0, category: 'greeting' },
  'how are you': { maxDistance: 2, category: 'greeting' },
  restart: { maxDistance: 0, category: 'greeting' },
  menu: { maxDistance: 0, category: 'greeting' },
  '人工': { maxDistance: 0, category: 'agentsupport' },
  '摇人': { maxDistance: 0, category: 'agentsupport' },
  '开单': { maxDistance: 0, category: 'agentsupport' },
  agent: { maxDistance: 1, category: 'agentsupport' },
  'live agent': { maxDistance: 2, category: 'agentsupport' },
  'it support': { maxDistance: 2, category: 'agentsupport' },
};

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

function checkSimilarity(text: string): 'greeting' | 'agentsupport' | null {
  const lower = text.toLowerCase().trim();
  for (const [word, entry] of Object.entries(SIMILARITY_WORDS)) {
    const dist = levenshteinDistance(lower, word);
    if (dist <= entry.maxDistance) return entry.category;
  }
  return null;
}

// ─── Triage Flow ───

@flowRegistry.register()
export class TriageFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === CoreEventType.TRIAGE;
  }

  async run(): Promise<EventStatus> {
    const { requester } = this.request;
    const userId = requester.id;
    logger.info(`TriageFlow for user ${userId}, action=${this.request.action}`);

    // 1. Peak shaving check
    const isPeakShaving = await this.peakShaving();
    if (isPeakShaving) {
      await this.event.propagateMsg(new TextTemplate([I18n.BOT_PEAK_SHAVING]));
      return EventStatus.COMPLETE;
    }

    // 2. Language detection for text-based actions
    const textActions = [ActionType.QUERY, ActionType.VOICE, ActionType.MIXED, ActionType.IMAGE, ActionType.FILE];
    if (textActions.includes(this.request.action as typeof textActions[number])) {
      const detectedLang = Request.detectLanguage(this.request.content.mixedText);
      this.request.language = detectedLang;

      // Update user settings memory with language
      if ('memory' in requester && requester.memory) {
        try {
          const memory = await requester.memory();
          memory.updateSettings({ info_maps: { ...memory.settings.info_maps, language: detectedLang } });
        } catch {
          // Non-fatal
        }
      }
    }

    // 3. Check for active ActionChain in memory
    if ('memory' in requester && requester.memory) {
      try {
        const memory = await requester.memory();

        if (memory.actionchain) {
          // Route to active action chain
          const mainKey = memory.actionchain.attributes['main_key'] as string | undefined;
          if (mainKey) {
            this.dispatcher.states.actionchain = { main_key: mainKey };
            this.dispatcher.eventchain.push(new Event(CoreEventType.ACTION_CHAIN));
            return EventStatus.COMPLETE;
          }
        }
      } catch {
        // Non-fatal
      }
    }

    // 4. Handle click actions
    if (this.request.action === ActionType.CLICK) {
      this.dispatcher.eventchain.push(new Event(AppEventType.CLICK));
      return EventStatus.COMPLETE;
    }

    // 5. Word similarity check for text queries
    const queryActions = [ActionType.QUERY, ActionType.VOICE, ActionType.FILE, ActionType.IMAGE, ActionType.MIXED];
    if (queryActions.includes(this.request.action as typeof queryActions[number])) {
      const similarity = checkSimilarity(this.request.content.mixedText);

      if (similarity === 'agentsupport') {
        await this.event.propagateMsg(new AgentSupportConfirmTemplate(this.request.language ?? undefined));
        this.dispatcher.eventchain.push(new Event(CoreEventType.ANALYSIS));
        return EventStatus.COMPLETE;
      }

      if (similarity === 'greeting') {
        this.dispatcher.eventchain.push(new Event(AppEventType.GREETING));
        return EventStatus.COMPLETE;
      }
    }

    // 6. Default: route to ReAct intent extraction
    this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_INTENT));
    return EventStatus.COMPLETE;
  }

  // ─── Peak Shaving ───

  private async peakShaving(): Promise<boolean> {
    try {
      const threshold = config.engine.rolling_requests_threshold;
      const count = await this.broker.incrementPeakShaving(60);  // direct IBroker method
      if (count >= threshold) {
        logger.warn(`Peak shaving triggered: ${count} >= ${threshold}`);
        return true;
      }
    } catch {
      // Redis not available — skip peak shaving
    }
    return false;
  }
}
