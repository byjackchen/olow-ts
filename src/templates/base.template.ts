import type { MsgType, MessengerType, Language } from '../engine/types.js';

export interface ITemplate {
  lang?: Language;
  render(messengerType: MessengerType): [MsgType, unknown];
  toData(): Record<string, unknown>;
}
