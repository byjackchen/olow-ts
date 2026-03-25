import type { Event } from './events.js';
import type { Request } from './events.js';
import type { IBroker } from './broker-interfaces.js';
import type { EventStatus, MessengerType, FlowStates } from './types.js';

// Forward reference to avoid circular dependency
export interface IDispatcher {
  broker: IBroker;
  request: Request;
  states: FlowStates;
  eventchain: Event[];
  backgroundTasks: Promise<unknown>[];
  toolsMap: Map<string, unknown>;
  actionchainsMap: Map<string, unknown>;
  validateClick(): Promise<[boolean, string, string | null]>;
  notifyEngineMsg(msg: string, isWarningSilent?: boolean): Promise<void>;
}

export abstract class BaseFlow {
  protected event: Event;
  protected dispatcher: IDispatcher;
  protected broker: IBroker;
  protected request: Request;
  statesSnapshot?: FlowStates;

  constructor(dispatcher: IDispatcher, event: Event) {
    this.event = event;
    this.dispatcher = dispatcher;
    this.broker = dispatcher.broker;
    this.request = dispatcher.request;
  }

  static canHandle(_event: Event, _messengerType?: MessengerType): boolean {
    throw new Error('canHandle() must be implemented by subclass');
  }

  abstract run(): Promise<EventStatus>;
}
