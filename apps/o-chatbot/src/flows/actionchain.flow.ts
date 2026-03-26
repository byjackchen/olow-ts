import {
  BaseFlow, Event, flowRegistry, getLogger,
  CoreEventType, EventStatus, ActionType, FlowMsgType, ACTION_CHAIN_ROOT_KEY,
  BaseActionChain, UnexpectedInputException, NoActiveException,
} from '@olow/engine';
import type { MessengerType, IDispatcher } from '@olow/engine';
const logger = getLogger();
import { TextTemplate, I18n } from '@olow/messengers';

@flowRegistry.register()
export class ActionChainFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === CoreEventType.ACTION_CHAIN;
  }

  async run(): Promise<EventStatus> {
    const userId = this.request.requester.id;
    logger.info(`ActionChainFlow for user ${userId}`);

    // Get the actionchain main_key from dispatcher states
    const mainKey = this.dispatcher.states.actionchain?.['main_key'] as string | undefined;
    if (!mainKey) {
      logger.error('No main_key in dispatcher.states.actionchain');
      return EventStatus.NO_HANDLER;
    }

    // Look up the actionchain class
    const ChainClass = this.dispatcher.actionchainsMap.get(mainKey);
    if (!ChainClass) {
      logger.error(`ActionChain not found for key: ${mainKey}`);
      return EventStatus.NO_HANDLER;
    }

    // Check if user clicked away from an active actionchain
    if (this.request.action === ActionType.CLICK) {
      const clickKey = this.request.content.getClickKey() ?? '';
      if (!clickKey.startsWith(ACTION_CHAIN_ROOT_KEY)) {
        // User clicked something outside the actionchain — cancel it
        await this.cleanActionchainMemory();
        const title = (ChainClass as unknown as { title?: string }).title ?? 'workflow';
        await this.event.propagateMsg(
          new TextTemplate([I18n.ACTIONCHAIN_CANCELLED, ` (${title})`]),
        );
        this.dispatcher.eventchain.push(new Event(CoreEventType.TRIAGE));
        return EventStatus.COMPLETE;
      }
    }

    // Execute the actionchain
    try {
      const ChainCtor = ChainClass as unknown as new (d: IDispatcher, e: Event) => BaseActionChain;
      const chain = new ChainCtor(this.dispatcher, this.event);
      await chain.run();
    } catch (err) {
      if (err instanceof UnexpectedInputException) {
        await this.cleanActionchainMemory();
        const title = (ChainClass as unknown as { title?: string }).title ?? 'workflow';
        await this.event.propagateMsg(
          new TextTemplate([I18n.ACTIONCHAIN_CANCELLED, ` (${title})`]),
        );
        this.dispatcher.eventchain.push(new Event(CoreEventType.TRIAGE));
        return EventStatus.COMPLETE;
      }

      if (err instanceof NoActiveException) {
        await this.cleanActionchainMemory();
        await this.event.propagateMsg(
          new TextTemplate([I18n.ACTIONCHAIN_CANCELLED_GENERIC]),
        );
        return EventStatus.COMPLETE;
      }

      logger.error({ msg: `ActionChain ${mainKey} failed`, err });
      throw err;
    }

    // Append analysis event
    this.dispatcher.eventchain.push(new Event(CoreEventType.ANALYSIS));
    return EventStatus.COMPLETE;
  }

  private async cleanActionchainMemory(): Promise<void> {
    const { requester } = this.request;
    if (!('memory' in requester) || !requester.memory) return;
    try {
      const memory = await requester.memory();
      memory.setActionChain(null);
    } catch {
      // Non-fatal
    }
  }
}
