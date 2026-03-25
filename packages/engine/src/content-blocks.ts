import { z } from 'zod';
import { ActionType } from './types.js';

// ═══════════════════ Block Schemas ═══════════════════

export const TextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});
export type TextBlock = z.infer<typeof TextBlockSchema>;

export const ImageBlockSchema = z.object({
  type: z.literal('image'),
  media_id: z.string(),
  url: z.string().optional(),
  desc: z.string().optional(),
  format: z.string().optional(),
});
export type ImageBlock = z.infer<typeof ImageBlockSchema>;

export const FileBlockSchema = z.object({
  type: z.literal('file'),
  media_id: z.string(),
  url: z.string().optional(),
  name: z.string().optional(),
  desc: z.string().optional(),
  format: z.string().optional(),
});
export type FileBlock = z.infer<typeof FileBlockSchema>;

export const VoiceBlockSchema = z.object({
  type: z.literal('voice'),
  media_id: z.string(),
  url: z.string().optional(),
  desc: z.string().optional(),
  format: z.string().optional(),
  duration: z.number().optional(),
});
export type VoiceBlock = z.infer<typeof VoiceBlockSchema>;

export const ClickBlockSchema = z.object({
  type: z.literal('click'),
  key: z.string(),
  desc: z.string().optional(),
});
export type ClickBlock = z.infer<typeof ClickBlockSchema>;

export const CommandBlockSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
  desc: z.string().optional(),
});
export type CommandBlock = z.infer<typeof CommandBlockSchema>;

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ImageBlockSchema,
  FileBlockSchema,
  VoiceBlockSchema,
  ClickBlockSchema,
  CommandBlockSchema,
]);
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

// ═══════════════════ ContentBlocks Class ═══════════════════

export class ContentBlocks {
  blocks: ContentBlock[];

  constructor(blocks: ContentBlock[] = []) {
    this.blocks = blocks;
  }

  // ─── Core Properties ───

  get mixedText(): string {
    const parts: string[] = [];
    for (const block of this.blocks) {
      switch (block.type) {
        case 'text':
          if (block.text) parts.push(block.text);
          break;
        case 'click':
          parts.push(block.desc ? `[Click: ${block.desc}]` : `[Click: ${block.key}]`);
          break;
        case 'command':
          parts.push(block.command);
          break;
        case 'image':
        case 'file':
        case 'voice':
          if (block.desc) {
            parts.push(`${block.type} media <media_id: ${block.media_id}, media_desc: ${block.desc}>`);
          } else {
            parts.push(`${block.type} media <media_id: ${block.media_id}>`);
          }
          break;
      }
    }
    return parts.join(' ');
  }

  get text(): string {
    return this.blocks
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ');
  }

  get mediaBlocks(): ContentBlock[] {
    return this.blocks.filter((b) => b.type !== 'text');
  }

  get firstMediaId(): string | undefined {
    for (const b of this.blocks) {
      if ('media_id' in b && b.media_id) return b.media_id;
    }
    return undefined;
  }

  get blockCount(): number {
    return this.blocks.length;
  }

  // ─── Query Methods ───

  hasMedia(): boolean {
    return this.mediaBlocks.length > 0;
  }

  isEmpty(): boolean {
    if (this.blocks.length === 0) return true;
    for (const block of this.blocks) {
      if (block.type === 'text' && block.text.trim()) return false;
      if (block.type !== 'text') return false;
    }
    return true;
  }

  getBlocksByType<T extends ContentBlock['type']>(type: T): Extract<ContentBlock, { type: T }>[] {
    return this.blocks.filter((b): b is Extract<ContentBlock, { type: T }> => b.type === type);
  }

  getCommand(): string | undefined {
    for (const block of this.blocks) {
      if (block.type === 'command') return block.command;
    }
    return undefined;
  }

  getClickKey(): string | undefined {
    for (const block of this.blocks) {
      if (block.type === 'click') return block.key;
    }
    return undefined;
  }

  getBlockByMediaId(mediaId: string): ContentBlock | undefined {
    for (const block of this.blocks) {
      if ('media_id' in block && block.media_id === mediaId) return block;
    }
    return undefined;
  }

  // ─── Mutation Methods ───

  append(block: ContentBlock): void {
    this.blocks.push(block);
  }

  setMediaDesc(mediaId: string, desc: string): boolean {
    for (const block of this.blocks) {
      if ('media_id' in block && block.media_id === mediaId && 'desc' in block) {
        (block as { desc?: string }).desc = desc;
        return true;
      }
    }
    return false;
  }

  // ─── Serialization ───

  serialize(): Record<string, unknown>[] {
    return this.blocks.map((b) => ({ ...b }));
  }

  toString(): string {
    return this.mixedText;
  }

  // ─── Factory Methods ───

  static fromText(text: string): ContentBlocks {
    if (!text || !text.trim()) return new ContentBlocks();
    return new ContentBlocks([{ type: 'text', text }]);
  }

  static empty(): ContentBlocks {
    return new ContentBlocks();
  }

  static fromBlocks(raw: Record<string, unknown>[]): ContentBlocks {
    const blocks = raw.map((b) => ContentBlockSchema.parse(b));
    return new ContentBlocks(blocks);
  }
}

// ═══════════════════ Action Type Detection ═══════════════════

export function determineActionType(content: ContentBlocks): ActionType {
  // Check for click/command blocks first
  for (const block of content.blocks) {
    if (block.type === 'click') return ActionType.CLICK;
    if (block.type === 'command') return ActionType.COMMAND;
  }

  // Then check media blocks
  const media = content.mediaBlocks;
  if (media.length === 0) return ActionType.QUERY;

  if (media.length === 1) {
    const first = media[0]!;
    if (first.type === 'image') return ActionType.IMAGE;
    if (first.type === 'file') return ActionType.FILE;
    if (first.type === 'voice') return ActionType.VOICE;
  }

  return ActionType.MIXED;
}
