import { MsgType, MessengerType as MT, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';
import { i18n, I18n } from '@olow/templates';
import { RichtextAtom } from '../services/wecom.format.js';

const GREETING_HELLO = i18n({
  en: 'Hi{name}! Welcome back.',
  cn: '你好{name}！欢迎回来。',
});

const GREETING_HOW_CAN_I_ASSIST = i18n({
  en: 'How can I assist you?',
  cn: '我能为您做些什么？',
});

const GREETING_HELP_FOOTER = i18n({
  en: '/help for available commands',
  cn: '/help 查看可用命令',
});

const GREETING_LANG_SWITCH = i18n({
  en: 'Language: ',
  cn: '语言：',
});

@templateRegistry.register({ name: 'GreetingMenuTemplate' })
export class GreetingMenuTemplate implements ITemplate {
  lang?: Language;
  private cycleId: string;
  private firstName?: string;
  private askmeList: Array<{ text: string; key: string }>;

  constructor(opts: {
    lang?: Language;
    cycleId: string;
    firstName?: string;
    askmeList?: Array<{ text: string; key: string }>;
  }) {
    this.lang = opts.lang;
    this.cycleId = opts.cycleId;
    this.firstName = opts.firstName;
    this.askmeList = opts.askmeList ?? [];
  }

  render(messengerType: MessengerType): [MsgType, unknown] {
    if (messengerType === MT.WECOM_BOT || messengerType === MT.WEB_BOT) {
      return this.renderRichtext();
    }
    // Fallback: plain text list
    return this.renderPlainText();
  }

  private renderRichtext(): [MsgType, unknown] {
    const atoms: RichtextAtom[] = [];

    // Greeting with user name
    const namePart = this.firstName ? ` ${this.firstName}` : '';
    atoms.push(RichtextAtom.text(GREETING_HELLO(this.lang).replace('{name}', namePart)));
    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.newline());

    // "How can I assist you?" section
    atoms.push(RichtextAtom.text(GREETING_HOW_CAN_I_ASSIST(this.lang)));
    atoms.push(RichtextAtom.newline());

    // Numbered menu items as buttons
    for (let i = 0; i < this.askmeList.length; i++) {
      const item = this.askmeList[i]!;
      atoms.push(RichtextAtom.newline());
      atoms.push(RichtextAtom.text(`${i + 1}. `));
      atoms.push(RichtextAtom.button(item.text, `${item.key}|${this.cycleId}`));
    }

    // Language switch buttons
    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.text(GREETING_LANG_SWITCH(this.lang)));
    atoms.push(RichtextAtom.button('EN', `lang-en|${this.cycleId}`));
    atoms.push(RichtextAtom.text(' | '));
    atoms.push(RichtextAtom.button('中文', `lang-cn|${this.cycleId}`));

    // Footer
    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.text(GREETING_HELP_FOOTER(this.lang)));

    return [MsgType.WECOM_RICHTEXT, RichtextAtom.build(atoms)];
  }

  private renderPlainText(): [MsgType, unknown] {
    const namePart = this.firstName ? ` ${this.firstName}` : '';
    const greeting = GREETING_HELLO(this.lang).replace('{name}', namePart);
    const lines: string[] = [greeting, '', GREETING_HOW_CAN_I_ASSIST(this.lang)];

    for (let i = 0; i < this.askmeList.length; i++) {
      lines.push(`${i + 1}. ${this.askmeList[i]!.text}`);
    }

    lines.push('', `${GREETING_LANG_SWITCH(this.lang)}EN | 中文`);
    lines.push('', GREETING_HELP_FOOTER(this.lang));

    return [MsgType.TEXT, lines.join('\n')];
  }

  toData(): Record<string, unknown> {
    return {
      cycleId: this.cycleId,
      firstName: this.firstName,
      askmeList: this.askmeList,
      lang: this.lang,
    };
  }
}
