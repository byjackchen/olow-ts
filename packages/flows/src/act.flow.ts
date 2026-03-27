import {
  BaseFlow, Event, flowRegistry, getLogger,
  CoreEventType, EventStatus, FlowMsgType, BaseTool,
} from '@olow/engine';
import type { MessengerType, ToolResult } from '@olow/engine';
import { ReactEventType } from './events.js';
import { getReactTemplateProvider } from './templates.js';

const logger = getLogger();

@flowRegistry.register()
export class ReactActFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === ReactEventType.REACT_ACT;
  }

  async run(): Promise<EventStatus> {
    const tpl = getReactTemplateProvider();
    const processChain = this.dispatcher.states.react.process_chain;
    const { actionName, actionInput } = this.findLastAction(processChain);

    if (!actionName) {
      logger.error('No action found in process chain');
      processChain.push({ type: 'observation', success: false, error: 'No action specified' });
      this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_PLAN));
      return EventStatus.COMPLETE;
    }

    const ToolClass = this.dispatcher.toolsMap.get(actionName);
    if (!ToolClass) {
      logger.error(`Tool not found: ${actionName}`);
      processChain.push({ type: 'observation', success: false, error: `Tool "${actionName}" is not available` });
      await this.event.propagateMsg(
        tpl.text([`Tool "${actionName}" not found`]), undefined, undefined, FlowMsgType.THINK_L2,
      );
      this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_PLAN));
      return EventStatus.COMPLETE;
    }

    const verifiedArgs = this.verifyParams(ToolClass.toolTag, actionInput, actionName);

    if (ToolClass.toolTag.actionchainMainKey) {
      this.dispatcher.states.actionchain = { main_key: ToolClass.toolTag.actionchainMainKey, ...verifiedArgs };
      processChain.push({ type: 'jump_out', target: 'actionchain', main_key: ToolClass.toolTag.actionchainMainKey });
      this.dispatcher.eventchain.push(new Event(CoreEventType.ACTION_CHAIN));
      return EventStatus.COMPLETE;
    }

    let observation: ToolResult;
    try {
      observation = await ToolClass.run(this.dispatcher, this.event, ...Object.values(verifiedArgs));
    } catch (err) {
      logger.error({ msg: `Tool ${actionName} execution failed`, err });
      observation = { success: false, error: String(err) };
    }

    processChain.push({ type: 'observation', tool: actionName, ...observation });
    this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_PLAN));
    return EventStatus.COMPLETE;
  }

  private findLastAction(chain: unknown[]): { actionName: string | null; actionInput: Record<string, unknown> } {
    for (let i = chain.length - 1; i >= 0; i--) {
      const entry = chain[i] as Record<string, unknown>;
      if (entry['type'] === 'action') {
        return {
          actionName: entry['action'] as string,
          actionInput: (entry['action_input'] as Record<string, unknown>) ?? {},
        };
      }
    }
    return { actionName: null, actionInput: {} };
  }

  private verifyParams(toolTag: { parameters: Record<string, { required: boolean }> }, input: Record<string, unknown>, toolName: string): Record<string, unknown> {
    const verified: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(toolTag.parameters)) {
      if (name in input) {
        verified[name] = input[name];
      } else if (def.required) {
        logger.warn(`Required parameter "${name}" missing for tool ${toolName}`);
      }
    }
    return verified;
  }
}
