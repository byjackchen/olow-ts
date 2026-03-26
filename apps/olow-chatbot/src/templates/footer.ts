import { MsgType, MessengerType as MT, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';
import { I18n } from '@olow/templates';
import { RichtextAtom } from '../services/wecom.format.js';

// ---------------------------------------------------------------------------
// HelpfulFooterTemplate
// ---------------------------------------------------------------------------

@templateRegistry.register({ name: 'HelpfulFooterTemplate' })
export class HelpfulFooterTemplate implements ITemplate {
  lang?: Language;
  private cycleId: string;
  private textList: Array<string | ((lang?: Language) => string)>;

  constructor(opts: { lang?: Language; cycleId: string; textList: Array<string | ((lang?: Language) => string)> }) {
    this.lang = opts.lang;
    this.cycleId = opts.cycleId;
    this.textList = opts.textList;
  }

  render(messengerType: MessengerType): [MsgType, unknown] {
    if (messengerType === MT.WECOM_BOT || messengerType === MT.WEB_BOT) {
      return this.renderRichtext();
    }
    // Fallback: plain text
    return [MsgType.TEXT, this.resolveTextList().join('\n')];
  }

  private resolveTextList(): string[] {
    return this.textList.map((t) => (typeof t === 'function' ? t(this.lang) : t));
  }

  private renderRichtext(): [MsgType, unknown] {
    const atoms: RichtextAtom[] = [];

    // Text content
    const resolved = this.resolveTextList();
    for (let i = 0; i < resolved.length; i++) {
      if (i > 0) atoms.push(RichtextAtom.newline());
      atoms.push(RichtextAtom.text(resolved[i]!));
    }

    // Feedback buttons
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

  toData(): Record<string, unknown> {
    return { lang: this.lang, cycleId: this.cycleId, textList: this.resolveTextList() };
  }
}

// ---------------------------------------------------------------------------
// FaqHelpfulFooterTemplate
// ---------------------------------------------------------------------------

@templateRegistry.register({ name: 'FaqHelpfulFooterTemplate' })
export class FaqHelpfulFooterTemplate implements ITemplate {
  lang?: Language;
  private cycleId: string;
  private textList: Array<string | ((lang?: Language) => string)>;

  constructor(opts: { lang?: Language; cycleId: string; textList: Array<string | ((lang?: Language) => string)> }) {
    this.lang = opts.lang;
    this.cycleId = opts.cycleId;
    this.textList = opts.textList;
  }

  render(messengerType: MessengerType): [MsgType, unknown] {
    if (messengerType === MT.WECOM_BOT || messengerType === MT.WEB_BOT) {
      return this.renderRichtext();
    }
    // Fallback: plain text
    return [MsgType.TEXT, this.resolveTextList().join('\n')];
  }

  private resolveTextList(): string[] {
    return this.textList.map((t) => (typeof t === 'function' ? t(this.lang) : t));
  }

  private renderRichtext(): [MsgType, unknown] {
    const atoms: RichtextAtom[] = [];

    // Text content
    const resolved = this.resolveTextList();
    for (let i = 0; i < resolved.length; i++) {
      if (i > 0) atoms.push(RichtextAtom.newline());
      atoms.push(RichtextAtom.text(resolved[i]!));
    }

    // Feedback buttons
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

  toData(): Record<string, unknown> {
    return { lang: this.lang, cycleId: this.cycleId, textList: this.resolveTextList() };
  }
}

// ---------------------------------------------------------------------------
// GeneralFeedbackConfirmTemplate
// ---------------------------------------------------------------------------

@templateRegistry.register({ name: 'GeneralFeedbackConfirmTemplate' })
export class GeneralFeedbackConfirmTemplate implements ITemplate {
  lang?: Language;

  constructor(opts: { lang?: Language } = {}) {
    this.lang = opts.lang;
  }

  render(_messengerType: MessengerType): [MsgType, unknown] {
    return [MsgType.TEXT, I18n.GENERAL_FEEDBACK_CONFIRM(this.lang)];
  }

  toData(): Record<string, unknown> {
    return { lang: this.lang };
  }
}
