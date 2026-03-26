import { MsgType, templateRegistry } from '@olow/engine';
import type { MessengerType, Language, ITemplate } from '@olow/engine';

@templateRegistry.register({ name: 'SingleMediaTemplate' })
export class SingleMediaTemplate implements ITemplate {
  lang?: Language;
  private mediaType: typeof MsgType.FILE | typeof MsgType.IMAGE;
  private mediaName: string;
  private mediaBase64: string;

  constructor(opts: { mediaType?: typeof MsgType.FILE | typeof MsgType.IMAGE; mediaName: string; mediaBase64: string }) {
    this.mediaType = opts.mediaType ?? MsgType.FILE;
    this.mediaName = opts.mediaName;
    this.mediaBase64 = opts.mediaBase64;
  }

  render(_messengerType: MessengerType): [MsgType, unknown] {
    return [this.mediaType, { media_name: this.mediaName, media_base64: this.mediaBase64 }];
  }

  toData(): Record<string, unknown> {
    return { mediaType: this.mediaType, mediaName: this.mediaName };
  }
}
