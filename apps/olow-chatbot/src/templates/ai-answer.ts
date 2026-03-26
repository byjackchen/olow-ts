import { MsgType, MessengerType as MT, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';
import { I18n } from '@olow/templates';
import { RichtextAtom } from '../services/wecom.format.js';

export interface Recommendation {
  type: 'faq' | 'tool';
  faqTitle?: string;
  faqHash?: string;
  toolName?: string;
  askMe?: string;
  buttonKey?: string;
}

/**
 * App-layer override of AiReActAnswerTemplate.
 * Renders WeCom richtext with interactive buttons for WECOM_BOT.
 * Overrides the default from @olow/templates via templateRegistry.
 */
@templateRegistry.register({ name: 'AiReActAnswerTemplate' })
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
    if (messengerType === MT.WECOM_BOT || messengerType === MT.WEB_BOT) {
      return this.renderRichtext();
    }
    if (messengerType === MT.SLACK_BOT) {
      return this.renderSlackBlocks();
    }
    // Fallback: plain text
    return [MsgType.TEXT, this.text];
  }

  private renderRichtext(): [MsgType, unknown] {
    const atoms: RichtextAtom[] = [];

    // Header
    atoms.push(RichtextAtom.text(I18n.AI_REACT_RESPONSE_CLAIM(this.lang)));
    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.newline());

    // Main response text
    atoms.push(RichtextAtom.text(this.text));

    // Recommendations
    if (this.recommendations.length > 0) {
      atoms.push(RichtextAtom.newline());
      atoms.push(RichtextAtom.newline());
      atoms.push(RichtextAtom.text(I18n.AI_REACT_RESPONSE_RECOMMENDATION(this.lang)));

      for (const rec of this.recommendations) {
        atoms.push(RichtextAtom.newline());
        if (rec.type === 'faq' && rec.faqTitle) {
          atoms.push(RichtextAtom.text('• '));
          atoms.push(RichtextAtom.button(rec.faqTitle, `faq-${rec.faqHash ?? ''}`));
        } else if (rec.type === 'tool' && rec.toolName) {
          atoms.push(RichtextAtom.text(`• ${rec.askMe ?? rec.toolName}`));
          if (rec.buttonKey) {
            atoms.push(RichtextAtom.text(' '));
            atoms.push(RichtextAtom.button('→', rec.buttonKey));
          }
        }
      }
    }

    // Footer — feedback buttons
    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.button(I18n.FOOTER_HELPFUL(this.lang), `helpful-yes|${this.cycleId}`));
    atoms.push(RichtextAtom.text(I18n.FOOTER_OR(this.lang)));
    atoms.push(RichtextAtom.button(I18n.FOOTER_HELPLESS(this.lang), `helpful-no|${this.cycleId}`));
    atoms.push(RichtextAtom.text(I18n.FOOTER_NEED(this.lang)));
    atoms.push(RichtextAtom.button(I18n.FOOTER_AGENTSUPPORT(this.lang), `agentsupport|${this.cycleId}`));
    atoms.push(RichtextAtom.text(' | '));
    atoms.push(RichtextAtom.button(I18n.FOOTER_GREETING(this.lang), 'greeting'));

    return [MsgType.WECOM_RICHTEXT, RichtextAtom.build(atoms)];
  }

  private renderSlackBlocks(): [MsgType, unknown] {
    const blocks: unknown[] = [
      { type: 'section', text: { type: 'mrkdwn', text: this.text } },
      { type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: '👍 Helpful' }, action_id: `helpful-yes|${this.cycleId}` },
        { type: 'button', text: { type: 'plain_text', text: '👎 Not Helpful' }, action_id: `helpful-no|${this.cycleId}` },
      ]},
    ];
    return [MsgType.SLACK_BLOCKS, blocks];
  }

  toData(): Record<string, unknown> {
    return { cycleId: this.cycleId, text: this.text, recommendations: this.recommendations, lang: this.lang };
  }
}
