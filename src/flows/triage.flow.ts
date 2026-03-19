import { BaseFlow } from './base.flow.js';
import {
  EventType,
  EventStatus,
  ActionType,
  type MessengerType,
  FlowMsgType,
} from '../engine/types.js';
import { Event, Request } from '../engine/events.js';
import { TextTemplate } from '../templates/text.template.js';
import { AgentSupportConfirmTemplate } from '../templates/text.template.js';
import { I18n } from '../templates/i18n.js';
import { registerFlow } from '../engine/dispatcher.js';
import { MemoryThreadName, type MemoryActionChain } from '../engine/memory/index.js';
import { config } from '../config/index.js';
import logger from '../engine/logger.js';

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

export class TriageFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.TRIAGE;
  }

  async run(): Promise<EventStatus> {
    const userId = this.request.requester.id;
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
      if ('memory' in this.request.requester) {
        try {
          const memory = await (this.request.requester as { memory: () => Promise<{ getThread: (n: string) => { memory: { info_maps: Record<string, unknown> } } | undefined; setThread: (n: string, m: unknown) => void }> }).memory();
          const settingsThread = memory.getThread(MemoryThreadName.SETTINGS);
          if (settingsThread) {
            settingsThread.memory.info_maps['language'] = detectedLang;
          } else {
            memory.setThread(MemoryThreadName.SETTINGS, { info_maps: { language: detectedLang } });
          }
        } catch {
          // Non-fatal
        }
      }
    }

    // 3. Check for active ActionChain in memory
    if ('memory' in this.request.requester) {
      try {
        const memory = await (this.request.requester as { memory: () => Promise<{ getThread: (n: string) => { name: string; memory: MemoryActionChain } | undefined; removeThread: (n: string) => boolean }> }).memory();

        // Find actionchain threads - keep only the latest, delete older ones
        let latestChainThread: { name: string; memory: MemoryActionChain } | null = null;
        for (const name of Object.values(MemoryThreadName)) {
          if (typeof name === 'string' && name.startsWith('actionchain-')) {
            const thread = memory.getThread(name);
            if (thread) {
              if (latestChainThread) {
                memory.removeThread(latestChainThread.name as MemoryThreadName);
              }
              latestChainThread = thread;
            }
          }
        }

        if (latestChainThread) {
          // Route to active action chain
          const mainKey = latestChainThread.name.replace('actionchain-', '');
          this.dispatcher.states.actionchain = { main_key: mainKey };
          this.dispatcher.eventchain.push(new Event(EventType.ACTION_CHAIN));
          return EventStatus.COMPLETE;
        }
      } catch {
        // Non-fatal
      }
    }

    // 4. Handle click actions
    if (this.request.action === ActionType.CLICK) {
      this.dispatcher.eventchain.push(new Event(EventType.CLICK));
      return EventStatus.COMPLETE;
    }

    // 5. Word similarity check for text queries
    const queryActions = [ActionType.QUERY, ActionType.VOICE, ActionType.FILE, ActionType.IMAGE, ActionType.MIXED];
    if (queryActions.includes(this.request.action as typeof queryActions[number])) {
      const similarity = checkSimilarity(this.request.content.mixedText);

      if (similarity === 'agentsupport') {
        await this.event.propagateMsg(new AgentSupportConfirmTemplate(this.request.language ?? undefined));
        this.dispatcher.eventchain.push(new Event(EventType.ANALYSIS));
        return EventStatus.COMPLETE;
      }

      if (similarity === 'greeting') {
        this.dispatcher.eventchain.push(new Event(EventType.GREETING));
        return EventStatus.COMPLETE;
      }
    }

    // 6. Default: route to ReAct intent extraction
    this.dispatcher.eventchain.push(new Event(EventType.REACT_INTENT));
    return EventStatus.COMPLETE;
  }

  // ─── Peak Shaving ───

  private async peakShaving(): Promise<boolean> {
    try {
      const threshold = config.engine.rolling_requests_threshold;
      const count = await this.broker.incrementPeakShaving(60);
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
registerFlow(TriageFlow);
