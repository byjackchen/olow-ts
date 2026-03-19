// Structural Stream Parser — parses LLM streaming output into structured sections
// Matches the Python app/kits/stream_parser.py

export const Section = {
  THINK_L2: 'think_l2',
  THINK_L3: 'think_l3',
  ANSWER: 'answer',
  ACTION: 'action',
  RAW: 'raw',
} as const;
export type Section = (typeof Section)[keyof typeof Section];

const SECTION_MARKERS = [
  { start: '<think>', end: '</think>', section: Section.THINK_L3 },
  { start: '<action>', end: '</action>', section: Section.ACTION },
] as const;

export class StructuralStreamParser {
  private buffer = '';
  private currentSection: Section = Section.ANSWER;
  private pendingClose: string | null = null;

  accumulate(_section: Section, _token: string): void {
    // For reasoning tokens that come pre-classified
  }

  feed(token: string): Array<[Section, string]> {
    this.buffer += token;
    const results: Array<[Section, string]> = [];

    while (this.buffer.length > 0) {
      // Check if we're inside a section waiting for close tag
      if (this.pendingClose) {
        const closeIdx = this.buffer.indexOf(this.pendingClose);
        if (closeIdx >= 0) {
          // Found close tag — emit content before it
          const content = this.buffer.slice(0, closeIdx);
          if (content) results.push([this.currentSection, content]);
          this.buffer = this.buffer.slice(closeIdx + this.pendingClose.length);
          this.pendingClose = null;
          this.currentSection = Section.ANSWER;
          continue;
        }
        // No close tag yet — emit everything as current section
        results.push([this.currentSection, this.buffer]);
        this.buffer = '';
        break;
      }

      // Look for opening tags
      let foundMarker = false;
      for (const marker of SECTION_MARKERS) {
        const openIdx = this.buffer.indexOf(marker.start);
        if (openIdx >= 0) {
          // Emit content before the tag as current section
          if (openIdx > 0) {
            results.push([this.currentSection, this.buffer.slice(0, openIdx)]);
          }
          this.buffer = this.buffer.slice(openIdx + marker.start.length);
          this.currentSection = marker.section;
          this.pendingClose = marker.end;
          foundMarker = true;
          break;
        }
      }

      if (!foundMarker) {
        // No markers found — check if buffer might contain a partial tag
        const hasPartial = this.buffer.includes('<');
        if (hasPartial) {
          const ltIdx = this.buffer.lastIndexOf('<');
          if (ltIdx > 0) {
            results.push([this.currentSection, this.buffer.slice(0, ltIdx)]);
            this.buffer = this.buffer.slice(ltIdx);
          }
          // Keep partial in buffer for next feed
          break;
        }

        // No markers, no partials — emit all as current section
        results.push([this.currentSection, this.buffer]);
        this.buffer = '';
        break;
      }
    }

    return results;
  }
}
