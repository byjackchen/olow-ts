// WeCom Richtext formatting utilities

export interface RichtextAtom {
  type: 'text' | 'link' | 'at';
  content?: string;
  href?: string;
  userId?: string;
}

export function textAtom(content: string): RichtextAtom {
  return { type: 'text', content };
}

export function linkAtom(text: string, href: string): RichtextAtom {
  return { type: 'link', content: text, href };
}

export function atAtom(userId: string): RichtextAtom {
  return { type: 'at', userId };
}

export function buildRichtext(atoms: RichtextAtom[]): string {
  return atoms
    .map((atom) => {
      switch (atom.type) {
        case 'text':
          return atom.content ?? '';
        case 'link':
          return `<a href="${atom.href}">${atom.content}</a>`;
        case 'at':
          return `@${atom.userId}`;
        default:
          return '';
      }
    })
    .join('');
}

export function truncateForWecom(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let encoded = encoder.encode(text);
  if (encoded.length <= maxBytes) return text;

  // Binary search for the right truncation point
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (encoder.encode(text.slice(0, mid)).length <= maxBytes - 20) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return text.slice(0, lo) + '\n...(truncated)';
}
