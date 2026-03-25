import { randomBytes } from 'node:crypto';
import { getLogger } from './logger.js';
const logger = getLogger();
import { requestContext, type RequestContext } from './context.js';
import {
  type EventStatus,
  EventStatus as ES,
  type ResponseMode,
  ResponseMode as RM,
  type SpaceType,
  type MessengerType,
  MessengerType as MT,
  ActionType as AT,
  type RequesterType,
  RequesterType as RT,
  type SystemName,
  type FlowMsgType,
  FlowMsgType as FMT,
  type SentToType,
  SentToType as STT,
  type ChannelType,
  ChannelType as CT,
  type FlowStates,
  FlowStatesSchema,
  type BotEngineStreamOutput,
  type DecodedMsg,
  type StreamDeltaMsg,
  MessageQueue,
} from './types.js';
import {
  Event,
  EventChain,
  Request,
  ResponseChain,
  SystemRequester,
  type FlowMsg,
  type StreamDeltaFlowMsg,
  type UniversalResponse,
  type IUser,
} from './events.js';
import type { IBroker } from './broker-interfaces.js';
import { createMessenger, type IMessenger } from './messengers.js';
import { BaseFlow, type IDispatcher } from './base-flow.js';
import type { ITemplate } from './base-template.js';
import { flowRegistry, toolRegistry, actionchainRegistry } from './registry.js';

// ─── Engine Config for Dispatcher ───

export interface DispatcherEngineConfig {
  max_event_loops: number;
  post_msg_verbose: boolean;
  developers: string[];
  administrators: string[];
}

const DEFAULT_DISPATCHER_CONFIG: DispatcherEngineConfig = {
  max_event_loops: 30,
  post_msg_verbose: false,
  developers: [],
  administrators: [],
};

let _dispatcherConfig: DispatcherEngineConfig = DEFAULT_DISPATCHER_CONFIG;

// Module-level constants (avoid per-call allocation)
const THINK_TYPES: FlowMsgType[] = [FMT.THINK_L1, FMT.THINK_L2];
const ARCHIVABLE_SYSTEM_ACTIONS: ReadonlySet<string> = new Set([AT.SN_TICKET_CLOSE, AT.SN_TICKET_SURVEY]);

export function setDispatcherConfig(cfg: DispatcherEngineConfig): void {
  _dispatcherConfig = cfg;
}

// ─── Dispatcher ───

export class Dispatcher implements IDispatcher {
  broker: IBroker;
  eventchain: EventChain;
  responses: ResponseChain;
  states: FlowStates;
  flows: Array<typeof BaseFlow>;
  toolsMap: Map<string, unknown>;
  actionchainsMap: Map<string, unknown>;
  backgroundTasks: Promise<unknown>[] = [];

  // Set during async initialization
  space: SpaceType | null = null;
  messenger: IMessenger | null = null;
  request!: Request;
  cycleId: string | null = null;

  constructor(broker: IBroker) {
    this.broker = broker;
    this.eventchain = new EventChain();
    this.responses = new ResponseChain();
    this.states = FlowStatesSchema.parse({});
    this.flows = [...flowRegistry.getRegistered<typeof BaseFlow>().values()];
    this.toolsMap = toolRegistry.getRegistered();
    this.actionchainsMap = actionchainRegistry.getRegistered();
  }

  async asyncInitialize(
    space: SpaceType,
    messengerType?: MessengerType,
    requesterType?: RequesterType,
    inMsg?: Record<string, unknown>,
    systemName?: SystemName,
  ): Promise<void> {
    this.space = space;

    if (!messengerType && !requesterType) {
      logger.info('Dispatcher initialized without messenger/requester — offline/test mode');
      return;
    }

    this.messenger = messengerType ? createMessenger(messengerType) : null;

    // Create Request
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
      // Outer loop: blocking await until first task completes
      while (true) {
        currentLoop++;
        if (currentLoop > maxLoops) {
          logger.error(`Maximum event loops (${maxLoops}) exceeded`);
          break;
        }

        // Inner loop: start tasks for events with satisfied dependencies
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

        // All done?
        if (runningTasks.size === 0) {
          const remaining = this.eventchain.filter((e) => e.status === ES.AWAITING);
          if (remaining.length === 0) break;
          throw new Error(`Deadlock: ${remaining.length} events cannot start`);
        }

        // Event-driven loop: yield messages and process completed tasks
        while (runningTasks.size > 0) {
          // Drain message queue
          while (msgQueue.hasMessages()) {
            const msg = msgQueue.getNoWait();
            if (msg) yield msg;
          }

          // Race: message arrival vs task completion
          const taskPromises = [...runningTasks.entries()].map(
            ([event, task]) => task.then((status) => ({ event, status })),
          );
          const msgWait = msgQueue.waitForMessage().then(() => null);

          const result = await Promise.race([...taskPromises, msgWait]);

          if (result === null) {
            // Message arrived — drain in next iteration
            continue;
          }

          // Task completed
          const { event, status } = result;
          event.status = status;
          logger.info(`Completed event ${event.type} with status ${status}`);

          if (status === ES.FAILED || status === ES.NO_HANDLER) {
            logger.error(`Event ${event.type} failed with status: ${status}`);
          }

          runningTasks.delete(event);
          break; // Back to outer loop to check for new events
        }
      }
    } catch (err) {
      logger.error({ msg: 'Event loop error', err });
      await this.notifyEngineMsg(String(err));
    } finally {
      msgQueue.close();

      // Drain remaining messages
      while (msgQueue.hasMessages()) {
        const msg = msgQueue.getNoWait();
        if (msg) yield msg;
      }

      // Wait for background tasks
      await Promise.allSettled(this.backgroundTasks);

      // Archive
      await this.archive();
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
    const flow = new (FlowClass as unknown as new (d: Dispatcher, e: Event) => BaseFlow)(this, event);
    event.bindFlow(flow);
    const status = await flow.run();
    flow.statesSnapshot = { ...this.states };
    return status;
  }

  // ─── Static Entry Point ───

  static async *asyncMain(opts: {
    broker: IBroker;
    responseMode: ResponseMode;
    space: SpaceType;
    messengerType?: MessengerType;
    requesterType?: RequesterType;
    inMsg?: Record<string, unknown>;
    systemName?: SystemName;
  }): AsyncGenerator<BotEngineStreamOutput> {
    const dispatcher = new Dispatcher(opts.broker);
    await dispatcher.asyncInitialize(
      opts.space,
      opts.messengerType,
      opts.requesterType,
      opts.inMsg,
      opts.systemName,
    );

    // Set request context for logging — AsyncLocalStorage.run doesn't support
    // async generators directly, so we enter the store manually
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
            const decoded = await dispatcher.decodeMsg(flowMsg);
            yield {
              type: 'message' as const,
              data: decoded,
            } satisfies BotEngineStreamOutput;
          }
        } else if (opts.responseMode === RM.POST) {
          if (!('delta' in msg)) {
            const flowMsg = msg as FlowMsg;
            await dispatcher.postMsg(flowMsg);
          }
        }
      }
    } catch (err) {
      logger.error({ msg: '[Global Error] in async_main', err });
      await dispatcher.notifyEngineMsg(String(err));
    }

    // Final states output
    yield {
      type: 'states' as const,
      data: dispatcher.states,
    } satisfies BotEngineStreamOutput;
  }

  // ─── Message Handling ───

  async prepareMsg(
    template: ITemplate,
    sentToType?: SentToType,
    sentTo?: string,
  ): Promise<{ template: ITemplate; sentToType: SentToType; sentTo: string }> {
    if (!sentToType) {
      if (this.request.channelType === CT.SINGLE) sentToType = STT.USER;
      else if (this.request.channelType === CT.GROUP) sentToType = STT.GROUPCHAT;
      else throw new Error('sentToType is required');
    }

    if (!sentTo) {
      if (sentToType === STT.USER) sentTo = this.request.requester.id;
      else if (sentToType === STT.GROUPCHAT) sentTo = this.request.channelId ?? '';
      else throw new Error('sentTo is required');
    }

    return { template, sentToType, sentTo };
  }

  async decodeMsg(flowMsg: FlowMsg): Promise<DecodedMsg> {
    const { template, sentToType, sentTo } = await this.prepareMsg(
      flowMsg.messageTemplate,
      flowMsg.sentToType,
      flowMsg.sentTo,
    );

    const [formatType, message] = template.render(this.messenger?.type ?? MT.BARE_TEXT);

    this.responses.push({
      timestamp: new Date(),
      sentToType,
      sentTo,
      templateName: template.constructor.name,
      templateData: template.toData(),
      messageType: flowMsg.messageType ?? FMT.ANSWER,
    });

    return {
      message_type: flowMsg.messageType ?? null,
      message: message as string | Record<string, unknown> | unknown[] | null,
      format_type: formatType,
      sent_to_type: sentToType,
      sent_to: sentTo,
    };
  }

  async postMsg(flowMsg: FlowMsg): Promise<void> {
    const messageType = flowMsg.messageType ?? FMT.ANSWER;

    // Check verbose mode
    if (!_dispatcherConfig.post_msg_verbose && messageType !== FMT.ANSWER && messageType !== FMT.THINK_L1) {
      logger.info(`Skipped message of type ${messageType} due to non-verbose mode`);
      return;
    }

    const { template, sentToType, sentTo } = await this.prepareMsg(
      flowMsg.messageTemplate,
      flowMsg.sentToType,
      flowMsg.sentTo,
    );

    // Determine reuse tracking ID
    let reuseTrackingId = flowMsg.reuseTrackingId;
    if (!reuseTrackingId && THINK_TYPES.includes(messageType)) {
      for (let i = this.responses.length - 1; i >= 0; i--) {
        const r = this.responses[i]!;
        if (THINK_TYPES.includes(r.messageType) && r.trackingId) {
          reuseTrackingId = r.trackingId;
          break;
        }
      }
    }

    // Determine revoke tracking IDs
    const revokeTrackingIds = messageType === FMT.ANSWER
      ? [...new Set(this.responses.filter((r) => THINK_TYPES.includes(r.messageType) && r.trackingId).map((r) => r.trackingId!))]
      : [];

    // Send
    if (this.messenger) {
      const { trackingId } = await this.messenger.say({
        messageType,
        sentToType,
        sentTo,
        dispatcher: this,
        template,
        reuseTrackingId,
        revokeTrackingIds,
      });

      this.responses.push({
        timestamp: new Date(),
        sentToType,
        sentTo,
        templateName: template.constructor.name,
        templateData: template.toData(),
        messageType,
        trackingId,
      });
    }
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

  // ─── Archive ───

  async archive(): Promise<void> {
    if (!this.request || !this.cycleId) return;

    if (
      this.request.requester.type !== RT.USER &&
      !ARCHIVABLE_SYSTEM_ACTIONS.has(this.request.action)
    ) {
      logger.info('Skipped cycle archive for non-user requester');
      return;
    }

    // Strip media base64 from responses
    const stripMediaBase64 = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(stripMediaBase64);
      if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        const sanitized: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(obj)) {
          if (key === 'media_base64') {
            sanitized[key] = 'archiving_stripped';
          } else {
            sanitized[key] = stripMediaBase64(item);
          }
        }
        return sanitized;
      }
      return value;
    };

    const archivedResponses = stripMediaBase64(this.responses.toList()) as unknown[];

    await this.broker.cyclesCreate({
      cycleId: this.cycleId,
      requesterType: this.request.requester.type,
      requesterId: this.request.requester.id,
      requestSessionId: this.request.sessionId,
      requestMsg: this.request.msg,
      requestAction: this.request.action,
      requestContent: this.request.content.mixedText,
      requestTime: this.request.timestamp,
      requestGroupchatId: this.request.channelType === CT.GROUP ? this.request.channelId : null,
      deviceType: this.request.deviceType,
      responses: archivedResponses,
      shownFaqs: this.states.shown_faqs,
      flowStates: this.states as unknown as Record<string, unknown>,
    });
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

          // Verify duplicates
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
