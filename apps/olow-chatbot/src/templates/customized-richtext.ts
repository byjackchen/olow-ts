import { MsgType, MessengerType as MT, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';
import { RichtextAtom } from '../services/wecom.format.js';

// ─── Message component type ───

export interface MessageComponent {
  component: 'text' | 'link' | 'button' | 'return';
  content?: string;
  link?: string;
  key?: string;
}

// ─── CustomizedRichtextTemplate ───

@templateRegistry.register({ name: 'CustomizedRichtextTemplate' })
export class CustomizedRichtextTemplate implements ITemplate {
  lang?: Language;
  private messageList: MessageComponent[];

  constructor(opts: { lang?: Language; messageList: MessageComponent[] }) {
    this.lang = opts.lang;
    this.messageList = opts.messageList;
  }

  render(messengerType: MessengerType): [MsgType, unknown] {
    if (messengerType === MT.WECOM_BOT || messengerType === MT.WEB_BOT) {
      return this.renderRichtext();
    }
    // Fallback: plain text
    return this.renderPlainText();
  }

  private renderRichtext(): [MsgType, unknown] {
    const atoms: RichtextAtom[] = [];

    for (const msg of this.messageList) {
      switch (msg.component) {
        case 'text':
          atoms.push(RichtextAtom.text(msg.content ?? ''));
          break;
        case 'link':
          atoms.push(RichtextAtom.link(msg.content ?? '', msg.link ?? ''));
          break;
        case 'button':
          atoms.push(RichtextAtom.button(msg.content ?? '', msg.key ?? ''));
          break;
        case 'return':
          atoms.push(RichtextAtom.newline());
          break;
      }
    }

    return [MsgType.WECOM_RICHTEXT, RichtextAtom.build(atoms)];
  }

  private renderPlainText(): [MsgType, unknown] {
    const parts: string[] = [];

    for (const msg of this.messageList) {
      switch (msg.component) {
        case 'text':
          parts.push(msg.content ?? '');
          break;
        case 'link':
          parts.push(`${msg.content ?? ''}: ${msg.link ?? ''}`);
          break;
        case 'button':
          parts.push(msg.content ?? '');
          break;
        case 'return':
          parts.push('\n');
          break;
      }
    }

    return [MsgType.TEXT, parts.join('')];
  }

  toData(): Record<string, unknown> {
    return {
      messageList: this.messageList,
      lang: this.lang,
    };
  }
}
