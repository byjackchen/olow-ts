import { MsgType, MessengerType as MT, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';
import { RichtextAtom } from '../services/wecom.format.js';

// ---------------------------------------------------------------------------
// NotificationNormalTemplate
// ---------------------------------------------------------------------------

@templateRegistry.register({ name: 'NotificationNormalTemplate' })
export class NotificationNormalTemplate implements ITemplate {
  lang?: Language;
  private title: string;
  private content: string;

  constructor(opts: { lang?: Language; title: string; content: string }) {
    this.lang = opts.lang;
    this.title = opts.title;
    this.content = opts.content;
  }

  render(messengerType: MessengerType): [MsgType, unknown] {
    if (messengerType === MT.WECOM_BOT) {
      return this.renderRichtext();
    }
    // Fallback: plain text with bracketed title
    return [MsgType.TEXT, `\u3010${this.title}\u3011\n${this.content}`];
  }

  private renderRichtext(): [MsgType, unknown] {
    const atoms: RichtextAtom[] = [];

    // Bold-style title (WeCom richtext has no bold — use brackets for emphasis)
    atoms.push(RichtextAtom.text(`\u3010${this.title}\u3011`));
    atoms.push(RichtextAtom.newline());

    // Content
    atoms.push(RichtextAtom.text(this.content));

    return [MsgType.WECOM_RICHTEXT, RichtextAtom.build(atoms)];
  }

  toData(): Record<string, unknown> {
    return { lang: this.lang, title: this.title, content: this.content };
  }
}
