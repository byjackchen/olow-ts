import type { MemoryThreadName } from '../engine/memory/index.js';
import type { EventStatus } from '../engine/types.js';
import type { Event } from '../engine/events.js';

// Custom exceptions for ActionChain flows
export class UnexpectedInputException extends Error {
  constructor(message = 'Unexpected input during ActionChain execution') {
    super(message);
    this.name = 'UnexpectedInputException';
  }
}

export class NoActiveException extends Error {
  constructor(message = 'No active ActionChain state found') {
    super(message);
    this.name = 'NoActiveException';
  }
}

export interface IDispatcherForChain {
  broker: unknown;
  request: unknown;
  states: { actionchain: Record<string, unknown> };
  eventchain: unknown[];
}

export abstract class BaseActionChain {
  static readonly mainKey: string;
  static readonly title: string;
  static readonly threadName: MemoryThreadName;

  protected dispatcher: IDispatcherForChain;
  protected event: Event;

  constructor(dispatcher: IDispatcherForChain, event: Event) {
    this.dispatcher = dispatcher;
    this.event = event;
  }

  abstract run(): Promise<EventStatus>;
}
