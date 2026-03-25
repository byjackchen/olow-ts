import { MsgType, MessengerType as MT } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';

export class AiIdleTemplate implements ITemplate {
  lang?: Language;
  private textParts: Array<string | ((lang?: Language) => string)>;

  constructor(text: string | Array<string | ((lang?: Language) => string)>, lang?: Language) {
    this.textParts = Array.isArray(text) ? text : [text];
    this.lang = lang;
  }

  render(_messengerType: MessengerType): [MsgType, string] {
    const text = this.textParts
      .map((t) => (typeof t === 'function' ? t(this.lang) : t))
      .join('');
    return [MsgType.TEXT, `🌀 ${text}`];
  }

  toData(): Record<string, unknown> {
    return { text: this.textParts.map((t) => (typeof t === 'function' ? t(this.lang) : t)).join(''), lang: this.lang };
  }
}

export interface Recommendation {
  type: 'faq' | 'tool';
  faqTitle?: string;
  faqHash?: string;
  toolName?: string;
  askMe?: string;
  buttonKey?: string;
}

export class AiReActAnswerTemplate implements ITemplate {
  lang?: Language;
  private cycleId: string;
  private text: string;
  private recommendations: Recommendation[];

  constructor(opts: { cycleId: string; text: string; recommendations?: Recommendation[]; lang?: Language }) {
    this.cycleId = opts.cycleId;
    this.text = opts.text;
    this.recommendations = opts.recommendations ?? [];
    this.lang = opts.lang;
  }

  render(messengerType: MessengerType): [MsgType, unknown] {
    // Build response parts
    const parts: string[] = [this.text];

    // Recommendations
    if (this.recommendations.length > 0) {
      parts.push('\n\n📋 Related:');
      for (const rec of this.recommendations) {
        if (rec.type === 'faq' && rec.faqTitle) {
          parts.push(`  • ${rec.faqTitle}`);
        } else if (rec.type === 'tool' && rec.toolName) {
          parts.push(`  • ${rec.askMe ?? rec.toolName}`);
        }
      }
    }

    const fullText = parts.join('\n');

    if (messengerType === MT.SLACK_BOT) {
      // Return Slack blocks structure
      const blocks: unknown[] = [
        { type: 'section', text: { type: 'mrkdwn', text: fullText } },
        { type: 'actions', elements: [
          { type: 'button', text: { type: 'plain_text', text: '👍 Helpful' }, action_id: `helpful-yes|${this.cycleId}` },
          { type: 'button', text: { type: 'plain_text', text: '👎 Not Helpful' }, action_id: `helpful-no|${this.cycleId}` },
        ]},
      ];
      return [MsgType.SLACK_BLOCKS, blocks];
    }

    // Default: plain text with button hints
    return [MsgType.TEXT, fullText];
  }

  toData(): Record<string, unknown> {
    return {
      cycleId: this.cycleId,
      text: this.text,
      recommendations: this.recommendations,
      lang: this.lang,
    };
  }
}
