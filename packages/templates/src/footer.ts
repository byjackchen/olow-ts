import { MsgType, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';

@templateRegistry.register({ name: 'BackToMenuFooter' })
export class BackToMenuFooter implements ITemplate {
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
