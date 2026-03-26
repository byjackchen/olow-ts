import { randomBytes } from 'node:crypto';
import { getLogger } from './logger.js';
const logger = getLogger();
import { requestContext, type RequestContext } from './context.js';
import {
  type EventStatus,
  EventStatus as ES,
  type ResponseMode,
  ResponseMode as RM,
  type MessengerType,
  type RequesterType,
  RequesterType as RT,
  type SystemName,
  type FlowStates,
  FlowStatesSchema,
  type BotEngineStreamOutput,
  MessageQueue,
} from './types.js';
import {
  Event,
  EventChain,
  Request,
  ResponseChain,
  type FlowMsg,
  type StreamDeltaFlowMsg,
} from './events.js';
import type { IBroker } from './broker-interfaces.js';
import { createMessenger, type IMessenger } from './messengers.js';
import { BaseFlow, type IDispatcher } from './base-flow.js';
import type { BaseTool } from './base-tool.js';
import type { BaseActionChain } from './base-actionchain.js';
import { flowRegistry, toolRegistry, actionchainRegistry } from './registry.js';
import { archiveCycle } from './archiver.js';
import { decodeMsg, postMsg } from './message-handler.js';

// ─── Engine Config for Dispatcher ───

export interface DispatcherEngineConfig {
  max_event_loops: number;
  post_msg_verbose: boolean;
  developers: string[];
  administrators: string[];
  archivableSystemActions?: string[];
}

const DEFAULT_DISPATCHER_CONFIG: DispatcherEngineConfig = {
  max_event_loops: 30,
  post_msg_verbose: false,
  developers: [],
  administrators: [],
  archivableSystemActions: [],
};

let _dispatcherConfig: DispatcherEngineConfig = DEFAULT_DISPATCHER_CONFIG;
let _archivableActions: ReadonlySet<string> = new Set();

export function setDispatcherConfig(cfg: DispatcherEngineConfig): void {
  _dispatcherConfig = cfg;
  _archivableActions = new Set(cfg.archivableSystemActions ?? []);
}

// ─── Dispatcher ───

export class Dispatcher implements IDispatcher {
  broker: IBroker;
  eventchain: EventChain;
  responses: ResponseChain;
  states: FlowStates;
  flows: Array<typeof BaseFlow>;
  toolsMap: Map<string, typeof BaseTool>;
  actionchainsMap: Map<string, typeof BaseActionChain>;
  backgroundTasks: Promise<unknown>[] = [];

  // Set during async initialization
  messenger: IMessenger | null = null;
  request!: Request;
  cycleId: string | null = null;

  constructor(broker: IBroker) {
    this.broker = broker;
    this.eventchain = new EventChain();
    this.responses = new ResponseChain();
    this.states = FlowStatesSchema.parse({});
    this.flows = [...flowRegistry.getRegistered<typeof BaseFlow>().values()];
    this.toolsMap = toolRegistry.getRegistered<typeof BaseTool>();
    this.actionchainsMap = actionchainRegistry.getRegistered<typeof BaseActionChain>();
  }

  async asyncInitialize(
    messengerType?: MessengerType,
    requesterType?: RequesterType,
    inMsg?: Record<string, unknown>,
    systemName?: SystemName,
  ): Promise<void> {
    if (!messengerType && !requesterType) {
      logger.info('Dispatcher initialized without messenger/requester — offline/test mode');
      return;
    }

    this.messenger = messengerType ? createMessenger(messengerType) : null;

    if (requesterType === RT.USER && messengerType) {
      this.request = new Request({
        requesterType,
        messenger: this.messenger,
        msg: inMsg ?? {},
        broker: this.broker,
      });
    } else if (requesterType === RT.SYSTEM) {
      this.request = new Request({
        requesterType,
        messenger: this.messenger,
        msg: inMsg ?? {},
        broker: this.broker,
        systemName,
      });
    } else {
      throw new Error(`Unrecognized combination: ${requesterType} / ${messengerType}`);
    }

    this.cycleId = randomBytes(12).toString('hex');
  }

  // ─── Event Loop ───

  private dependenciesSatisfied(event: Event): boolean {
    if (!event.dependencies.length) return true;
    return event.dependencies.every((dep) => dep.status === ES.COMPLETE);
  }

  async *loopEventChain(): AsyncGenerator<FlowMsg | StreamDeltaFlowMsg> {
    const maxLoops = _dispatcherConfig.max_event_loops;
    let currentLoop = 0;
    const runningTasks = new Map<Event, Promise<EventStatus>>();
    const msgQueue = new MessageQueue<FlowMsg | StreamDeltaFlowMsg>();

    try {
      while (true) {
        currentLoop++;
        if (currentLoop > maxLoops) {
          logger.error(`Maximum event loops (${maxLoops}) exceeded`);
          break;
        }

        for (const event of this.eventchain) {
          if (
            event.status === ES.AWAITING &&
            !runningTasks.has(event) &&
            this.dependenciesSatisfied(event)
          ) {
            event.status = ES.IN_PROGRESS;
            event.msgQueue = msgQueue;
            const task = this.emit(event);
            runningTasks.set(event, task);
            logger.info(`Started event ${event.type}`);
          }
        }

        if (runningTasks.size === 0) {
          const remaining = this.eventchain.filter((e) => e.status === ES.AWAITING);
          if (remaining.length === 0) break;
          throw new Error(`Deadlock: ${remaining.length} events cannot start`);
        }

        while (runningTasks.size > 0) {
          while (msgQueue.hasMessages()) {
            const msg = msgQueue.getNoWait();
            if (msg) yield msg;
          }

          const taskPromises = [...runningTasks.entries()].map(
            ([event, task]) => task.then((status) => ({ event, status })),
          );
          const msgWait = msgQueue.waitForMessage().then(() => null);
          const result = await Promise.race([...taskPromises, msgWait]);

          if (result === null) continue;

          const { event, status } = result;
          event.status = status;
          logger.info(`Completed event ${event.type} with status ${status}`);

          if (status === ES.FAILED || status === ES.NO_HANDLER) {
            logger.error(`Event ${event.type} failed with status: ${status}`);
          }

          runningTasks.delete(event);
          break;
        }
      }
    } catch (err) {
      logger.error({ msg: 'Event loop error', err });
      await this.notifyEngineMsg(String(err));
    } finally {
      msgQueue.close();
      while (msgQueue.hasMessages()) {
        const msg = msgQueue.getNoWait();
        if (msg) yield msg;
      }
      await Promise.allSettled(this.backgroundTasks);
      await archiveCycle({
        request: this.request,
        cycleId: this.cycleId,
        responses: this.responses,
        states: this.states,
        broker: this.broker,
        archivableActions: _archivableActions,
      });
    }
  }

  // ─── Emit ───

  async emit(event: Event): Promise<EventStatus> {
    const FlowClass = this.flows.find((f) => f.canHandle(event, this.messenger?.type ?? undefined));
    if (!FlowClass) {
      logger.error(`Event ${event.type} found no handler class!`);
      return ES.NO_HANDLER;
    }

    logger.info(`Event ${event.type} found handler class ${FlowClass.name}`);
    const FlowCtor = FlowClass as unknown as new (d: Dispatcher, e: Event) => BaseFlow;
    const flow = new FlowCtor(this, event);
    event.bindFlow(flow);
    const status = await flow.run();
    flow.statesSnapshot = { ...this.states };
    return status;
  }

  // ─── Static Entry Point ───

  static async *asyncMain(opts: {
    broker: IBroker;
    responseMode: ResponseMode;
    messengerType?: MessengerType;
    requesterType?: RequesterType;
    inMsg?: Record<string, unknown>;
    systemName?: SystemName;
  }): AsyncGenerator<BotEngineStreamOutput> {
    const dispatcher = new Dispatcher(opts.broker);
    await dispatcher.asyncInitialize(
      opts.messengerType, opts.requesterType, opts.inMsg, opts.systemName,
    );

    requestContext.enterWith({
      cycleId: dispatcher.cycleId ?? '',
      requesterType: dispatcher.request?.requester?.type ?? '',
      requesterId: dispatcher.request?.requester?.id ?? '',
      sessionId: dispatcher.request?.sessionId ?? '',
    });

    try {
      const initialEvent = dispatcher.request.initEvent();
      dispatcher.eventchain.push(initialEvent);

      for await (const msg of dispatcher.loopEventChain()) {
        if (opts.responseMode === RM.STREAM) {
          if ('delta' in msg) {
            const delta = msg as StreamDeltaFlowMsg;
            yield {
              type: 'stream_delta' as const,
              data: {
                message_type: delta.messageType,
                delta: delta.delta,
                is_complete: delta.isComplete,
              },
            } satisfies BotEngineStreamOutput;
          } else {
            const flowMsg = msg as FlowMsg;
            const decoded = await decodeMsg(flowMsg, dispatcher.request, dispatcher.messenger, dispatcher.responses);
            yield {
              type: 'message' as const,
              data: decoded,
            } satisfies BotEngineStreamOutput;
          }
        } else if (opts.responseMode === RM.POST) {
          if (!('delta' in msg)) {
            const flowMsg = msg as FlowMsg;
            await postMsg(flowMsg, dispatcher, dispatcher.request, dispatcher.messenger, dispatcher.responses, _dispatcherConfig.post_msg_verbose);
          }
        }
      }
    } catch (err) {
      logger.error({ msg: '[Global Error] in async_main', err });
      await dispatcher.notifyEngineMsg(String(err));
    }

    yield {
      type: 'states' as const,
      data: dispatcher.states,
    } satisfies BotEngineStreamOutput;
  }

  // ─── Notify Engine Error ───

  async notifyEngineMsg(noticeMsg: string, isWarningSilent = false): Promise<void> {
    const truncated = noticeMsg.slice(0, 2000);
    const developers = _dispatcherConfig.developers;

    if (!isWarningSilent) {
      const content = `[Error] Requester ${this.request?.requester?.id}: ${truncated}`;
      this.states.event_tracking.push({ bot_engine_error: content });
      logger.error(`Backend Error: ${content}`);
    } else {
      const content = `[Warning] Requester ${this.request?.requester?.id}: ${truncated}`;
      logger.warn(`Backend Warning: ${content}`);
    }

    for (const dev of developers) {
      try {
        await this.broker.messaging.sendText(dev, truncated);
      } catch {
        // Best effort
      }
    }
  }

  // ─── Click Validation ───

  async validateClick(): Promise<[result: boolean, strippedKey: string, cycleId: string | null]> {
    const fullKey = this.request.content.getClickKey() ?? '';
    const parts = fullKey.split('|');

    if (parts.length === 1) {
      logger.info(`Click without cycle id ${fullKey}, skip validation`);
      return [true, fullKey, null];
    }

    if (parts.length === 2) {
      const [key, cycleId] = parts as [string, string];

      if (this.states.click_validation !== true) {
        try {
          const cycleDoc = await this.broker.cyclesGetOneById(cycleId);
          if (!cycleDoc) {
            this.states.click_validation = true;
            return [false, key, cycleId];
          }

          let clicks = (cycleDoc['clicks'] as string[] | null) ?? [];
          const mainKey = key.split('-')[0]!;

          if (clicks.includes(mainKey)) {
            this.states.click_validation = true;
            return [false, key, cycleId];
          }

          clicks.push(mainKey);
          await this.broker.cyclesUpdate(cycleId, { clicks });
          this.states.click_validation = true;
          return [true, key, cycleId];
        } catch (err) {
          logger.error({ msg: `Error validating click ${fullKey}`, err });
          this.states.click_validation = true;
          return [false, key ?? fullKey, cycleId ?? null];
        }
      }

      return [true, key, cycleId];
    }

    throw new Error(`Invalid user Click ${fullKey}`);
  }
}
