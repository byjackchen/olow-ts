import { MsgType, MessengerType as MT, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';
import { i18n } from '@olow/templates';
import { RichtextAtom } from '../services/wecom.format.js';

// ─── I18n entries ───

const TICKET_HEADER = i18n({
  en: '🎫 Your ServiceNow Tickets',
  cn: '🎫 您的 ServiceNow 工单',
});

const TICKET_NO_INCIDENTS = i18n({
  en: 'No open tickets found.',
  cn: '未找到待处理的工单。',
});

const TICKET_FOLLOW_UP = i18n({
  en: 'Follow up',
  cn: '跟进',
});

const TICKET_SATISFACTION_QUESTION = i18n({
  en: 'How satisfied were you with the resolution?',
  cn: '您对工单处理结果的满意度如何？',
});

// ─── Incident type ───

export interface Incident {
  number: string;
  short_description: string;
  assigned_to?: string;
  sys_created_on?: string;
}

// ─── FunctionCallTicketTemplate ───

@templateRegistry.register({ name: 'FunctionCallTicketTemplate' })
export class FunctionCallTicketTemplate implements ITemplate {
  lang?: Language;
  private cycleId: string;
  private textList: Array<string | ((lang?: Language) => string)>;
  private incidents: Incident[];

  constructor(opts: {
    lang?: Language;
    cycleId: string;
    textList: Array<string | ((lang?: Language) => string)>;
    incidents: Incident[];
  }) {
    this.lang = opts.lang;
    this.cycleId = opts.cycleId;
    this.textList = opts.textList;
    this.incidents = opts.incidents;
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

    // Header text from textList
    for (const item of this.textList) {
      const text = typeof item === 'function' ? item(this.lang) : item;
      atoms.push(RichtextAtom.text(text));
      atoms.push(RichtextAtom.newline());
    }

    atoms.push(RichtextAtom.newline());

    if (this.incidents.length === 0) {
      atoms.push(RichtextAtom.text(TICKET_NO_INCIDENTS(this.lang)));
    } else {
      for (const incident of this.incidents) {
        atoms.push(RichtextAtom.text(`🎫 ${incident.number} - ${incident.short_description}`));
        atoms.push(RichtextAtom.text(' '));
        atoms.push(RichtextAtom.button(TICKET_FOLLOW_UP(this.lang), `ticket-followup|${this.cycleId}|${incident.number}`));
        atoms.push(RichtextAtom.newline());
      }
    }

    return [MsgType.WECOM_RICHTEXT, RichtextAtom.build(atoms)];
  }

  private renderPlainText(): [MsgType, unknown] {
    const lines: string[] = [];

    for (const item of this.textList) {
      const text = typeof item === 'function' ? item(this.lang) : item;
      lines.push(text);
    }

    lines.push('');

    if (this.incidents.length === 0) {
      lines.push(TICKET_NO_INCIDENTS(this.lang));
    } else {
      for (const incident of this.incidents) {
        lines.push(`🎫 ${incident.number} - ${incident.short_description}`);
      }
    }

    return [MsgType.TEXT, lines.join('\n')];
  }

  toData(): Record<string, unknown> {
    return {
      cycleId: this.cycleId,
      incidents: this.incidents,
      lang: this.lang,
    };
  }
}

// ─── TicketSatisfactionTemplate ───

const RATING_LABELS = [
  '⭐⭐⭐⭐⭐ (5)',
  '⭐⭐⭐⭐ (4)',
  '⭐⭐⭐ (3)',
  '⭐⭐ (2)',
  '⭐ (1)',
] as const;

@templateRegistry.register({ name: 'TicketSatisfactionTemplate' })
export class TicketSatisfactionTemplate implements ITemplate {
  lang?: Language;
  private cycleId: string;
  private ticketId: string;

  constructor(opts: { lang?: Language; cycleId: string; ticketId: string }) {
    this.lang = opts.lang;
    this.cycleId = opts.cycleId;
    this.ticketId = opts.ticketId;
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

    atoms.push(RichtextAtom.text(TICKET_SATISFACTION_QUESTION(this.lang)));
    atoms.push(RichtextAtom.newline());
    atoms.push(RichtextAtom.newline());

    for (let score = 5; score >= 1; score--) {
      atoms.push(RichtextAtom.button(RATING_LABELS[5 - score]!, `ticket-rating|${this.cycleId}|${this.ticketId}|${score}`));
      if (score > 1) {
        atoms.push(RichtextAtom.newline());
      }
    }

    return [MsgType.WECOM_RICHTEXT, RichtextAtom.build(atoms)];
  }

  private renderPlainText(): [MsgType, unknown] {
    const lines: string[] = [
      TICKET_SATISFACTION_QUESTION(this.lang),
      '',
    ];

    for (let score = 5; score >= 1; score--) {
      lines.push(`${RATING_LABELS[5 - score]} — Reply "${score}" to rate`);
    }

    return [MsgType.TEXT, lines.join('\n')];
  }

  toData(): Record<string, unknown> {
    return {
      cycleId: this.cycleId,
      ticketId: this.ticketId,
      lang: this.lang,
    };
  }
}
