import { MsgType, MessengerType as MT, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';
import { i18n } from '@olow/templates';
import type { ProgressItem } from '@olow/templates';
import { RichtextAtom } from '../services/wecom.format.js';

// ─── App-level override: WeCom richtext with interactive buttons ───
// Overrides the plain-text default from @olow/templates via same registry name.

const ACTIONCHAIN_CANCEL = i18n({ en: 'Cancel', cn: '取消' });
const ACTIONCHAIN_SUBMIT = i18n({ en: 'Submit', cn: '提交' });
const ACTIONCHAIN_PROGRESS = i18n({ en: 'Progress:', cn: '进度：' });

const STATUS_ICON: Record<ProgressItem['status'], string> = {
  done: '✅',
  active: '🔵',
  pending: '⚪',
};

@templateRegistry.register({ name: 'ActionChainCardTemplate' })
export class ActionChainCardTemplate implements ITemplate {
  lang?: Language;
  private cycleId: string;
  private title: string;
  private message: string;
  private progresses: ProgressItem[];
  private cancelButton: boolean;
  private submitButton: boolean;
  private stepButtonOptions: Array<{ text: string; key: string }>;

  constructor(opts: {
    lang?: Language;
    cycleId: string;
    title: string;
    message: string;
    progresses?: ProgressItem[];
    cancelButton?: boolean;
    submitButton?: boolean;
    stepButtonOptions?: Array<{ text: string; key: string }>;
  }) {
    this.lang = opts.lang;
    this.cycleId = opts.cycleId;
    this.title = opts.title;
    this.message = opts.message;
    this.progresses = opts.progresses ?? [];
    this.cancelButton = opts.cancelButton ?? false;
    this.submitButton = opts.submitButton ?? false;
    this.stepButtonOptions = opts.stepButtonOptions ?? [];
  }

  render(messengerType: MessengerType): [MsgType, unknown] {
    if (messengerType === MT.WECOM_BOT || messengerType === MT.WEB_BOT) {
      return this.renderRichtext();
    }
    return this.renderPlainText();
  }

  private renderRichtext(): [MsgType, unknown] {
    const atoms: RichtextAtom[] = [];

    atoms.push(RichtextAtom.text(`【${this.title}】`));
    atoms.push(RichtextAtom.newline());

    if (this.progresses.length > 0) {
      atoms.push(RichtextAtom.newline());
      atoms.push(RichtextAtom.text(ACTIONCHAIN_PROGRESS(this.lang)));
      atoms.push(RichtextAtom.newline());
      for (const step of this.progresses) {
        atoms.push(RichtextAtom.text(`${STATUS_ICON[step.status]} ${step.label}`));
        atoms.push(RichtextAtom.newline());
      }
    }

    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.text(this.message));

    if (this.stepButtonOptions.length > 0) {
      atoms.push(RichtextAtom.newline());
      atoms.push(RichtextAtom.newline());
      for (let i = 0; i < this.stepButtonOptions.length; i++) {
        const opt = this.stepButtonOptions[i]!;
        if (i > 0) atoms.push(RichtextAtom.text(' '));
        atoms.push(RichtextAtom.button(opt.text, `${opt.key}|${this.cycleId}`));
      }
    }

    if (this.cancelButton || this.submitButton) {
      atoms.push(RichtextAtom.newline());
      atoms.push(RichtextAtom.newline());
      if (this.cancelButton) {
        atoms.push(RichtextAtom.button(ACTIONCHAIN_CANCEL(this.lang), `ac-cancel|${this.cycleId}`));
      }
      if (this.cancelButton && this.submitButton) {
        atoms.push(RichtextAtom.text(' | '));
      }
      if (this.submitButton) {
        atoms.push(RichtextAtom.button(ACTIONCHAIN_SUBMIT(this.lang), `ac-submit|${this.cycleId}`));
      }
    }

    return [MsgType.WECOM_RICHTEXT, RichtextAtom.build(atoms)];
  }

  private renderPlainText(): [MsgType, string] {
    const lines: string[] = [`【${this.title}】`];

    if (this.progresses.length > 0) {
      lines.push('', ACTIONCHAIN_PROGRESS(this.lang));
      for (const step of this.progresses) {
        lines.push(`${STATUS_ICON[step.status]} ${step.label}`);
      }
    }

    lines.push('', this.message);

    if (this.stepButtonOptions.length > 0) {
      lines.push('');
      for (let i = 0; i < this.stepButtonOptions.length; i++) {
        lines.push(`${i + 1}. ${this.stepButtonOptions[i]!.text}`);
      }
    }

    if (this.cancelButton || this.submitButton) {
      const actions: string[] = [];
      if (this.cancelButton) actions.push(ACTIONCHAIN_CANCEL(this.lang));
      if (this.submitButton) actions.push(ACTIONCHAIN_SUBMIT(this.lang));
      lines.push('', actions.join(' | '));
    }

    return [MsgType.TEXT, lines.join('\n')];
  }

  toData(): Record<string, unknown> {
    return {
      cycleId: this.cycleId, title: this.title, message: this.message,
      progresses: this.progresses, lang: this.lang,
    };
  }
}
