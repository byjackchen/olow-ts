import { MsgType, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';
import { i18n } from './i18n.js';

// ─── Package-level default: plain text only (no WeCom dependency) ───
// App layer can override by registering the same name with richtext rendering.

const ACTIONCHAIN_CANCEL = i18n({ en: 'Cancel', cn: '取消' });
const ACTIONCHAIN_SUBMIT = i18n({ en: 'Submit', cn: '提交' });
const ACTIONCHAIN_PROGRESS = i18n({ en: 'Progress:', cn: '进度：' });

export interface ProgressItem {
  label: string;
  status: 'done' | 'active' | 'pending';
}

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

  render(_messengerType: MessengerType): [MsgType, string] {
    const lines: string[] = [];

    lines.push(`【${this.title}】`);

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
