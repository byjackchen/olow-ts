// WeCom Richtext Atom — matches WeCom rich_text API format
// Ref: oit-chatbot/app/kits/format_kit.py

export type WeComRichtextEntry = {
  type: 'text';
  text: { content: string };
} | {
  type: 'link';
  link: { type: 'view' | 'click'; text: string; key: string; browser?: string };
};

export class RichtextAtom {
  readonly entry: WeComRichtextEntry;

  private constructor(entry: WeComRichtextEntry) {
    this.entry = entry;
  }

  /** Plain text */
  static text(content: string): RichtextAtom {
    return new RichtextAtom({ type: 'text', text: { content } });
  }

  /** Newline */
  static newline(): RichtextAtom {
    return RichtextAtom.text('\n');
  }

  /** Clickable hyperlink (opens in browser) */
  static link(text: string, url: string): RichtextAtom {
    return new RichtextAtom({ type: 'link', link: { type: 'view', text, key: url, browser: '1' } });
  }

  /** Interactive button (sends click callback with key) */
  static button(text: string, key: string): RichtextAtom {
    return new RichtextAtom({ type: 'link', link: { type: 'click', text, key } });
  }

  /** Build richtext payload from atom list — ready for WeCom API */
  static build(atoms: RichtextAtom[]): WeComRichtextEntry[] {
    return atoms.map((a) => a.entry);
  }
}
