import { MsgType } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';

export class TextTemplate implements ITemplate {
  lang?: Language;
  private textList: Array<string | ((lang?: Language) => string)>;

  constructor(textList: Array<string | ((lang?: Language) => string)>, lang?: Language) {
    this.textList = textList;
    this.lang = lang;
  }

  render(_messengerType: MessengerType): [MsgType, string] {
    const text = this.textList
      .map((t) => (typeof t === 'function' ? t(this.lang) : t))
      .join('');
    return [MsgType.TEXT, text];
  }

  toData(): Record<string, unknown> {
    return {
      text: this.textList.map((t) => (typeof t === 'function' ? t(this.lang) : t)).join(''),
      lang: this.lang,
    };
  }
}

export class AgentSupportConfirmTemplate implements ITemplate {
  lang?: Language;

  constructor(lang?: Language) {
    this.lang = lang;
  }

  render(_messengerType: MessengerType): [MsgType, string] {
    const text = this.lang === 'cn'
      ? '您是否需要转接人工客服？\n\n[确认] [取消]'
      : 'Would you like to connect with a live agent?\n\n[Confirm] [Cancel]';
    return [MsgType.TEXT, text];
  }

  toData(): Record<string, unknown> {
    return { lang: this.lang };
  }
}
