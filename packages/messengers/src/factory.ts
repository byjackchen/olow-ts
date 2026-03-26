import { messengerRegistry } from '@olow/engine';
import type { MessengerType, IMessenger } from '@olow/engine';
import { StubMessenger } from './stub.messenger.js';

// ─── Messenger Factory ───

export class Messenger {
  /** Create a messenger instance by type. Looks up messengerRegistry, falls back to StubMessenger. */
  static create(type: MessengerType): IMessenger {
    const MessengerClass = messengerRegistry.getRegistered().get(type) as
      (new (...args: unknown[]) => IMessenger) | undefined;

    if (MessengerClass) {
      return new MessengerClass();
    }

    return new StubMessenger(type);
  }
}
