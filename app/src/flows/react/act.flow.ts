import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType, ACTION_CHAIN_ROOT_KEY,
} from '@olow/engine';
import { BaseTool } from '@olow/engine';
import type { MessengerType, ToolResult, ToolTag } from '@olow/engine';
const logger = getLogger();
import { AiIdleTemplate } from '../../templates/ai.template.js';
import { TextTemplate } from '../../templates/text.template.js';
import { I18n } from '../../templates/i18n.js';

@flowRegistry.register()
export class ReactActFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_ACT;
  }

  async run(): Promise<EventStatus> {
    logger.info(`ReactActFlow executing for user ${this.request.requester.id}`);

    const processChain = this.dispatcher.states.react.process_chain;

    // Find the last action in process chain
    let actionName: string | null = null;
    let actionInput: Record<string, unknown> = {};

    for (let i = processChain.length - 1; i >= 0; i--) {
      const entry = processChain[i] as Record<string, unknown>;
      if (entry['type'] === 'action') {
        actionName = entry['action'] as string;
        actionInput = (entry['action_input'] as Record<string, unknown>) ?? {};
        break;
      }
    }

    if (!actionName) {
      logger.error('No action found in process chain');
      processChain.push({ type: 'observation', success: false, error: 'No action specified' });
      this.dispatcher.eventchain.push(new Event(EventType.REACT_PLAN));
      return EventStatus.COMPLETE;
    }

    // Resolve tool
    const ToolClass = this.dispatcher.toolsMap.get(actionName) as (typeof BaseTool) | undefined;
    if (!ToolClass) {
      logger.error(`Tool not found: ${actionName}`);
      processChain.push({
        type: 'observation',
        success: false,
        error: `Tool "${actionName}" is not available`,
      });
      await this.event.propagateMsg(
        new TextTemplate([`Tool "${actionName}" not found`]),
        undefined,
        undefined,
        FlowMsgType.THINK_L2,
      );
      this.dispatcher.eventchain.push(new Event(EventType.REACT_PLAN));
      return EventStatus.COMPLETE;
    }

    const toolTag = ToolClass.toolTag;

    // Verify and clean parameters — remove extra params not in tool_tag
    const verifiedKwargs: Record<string, unknown> = {};
    for (const [paramName, paramDef] of Object.entries(toolTag.parameters)) {
      if (paramName in actionInput) {
        verifiedKwargs[paramName] = actionInput[paramName];
      } else if (paramDef.required) {
        logger.warn(`Required parameter "${paramName}" missing for tool ${actionName}`);
      }
    }

    // Check if tool bridges to ActionChain
    if (toolTag.actionchainMainKey) {
      this.dispatcher.states.actionchain = {
        main_key: toolTag.actionchainMainKey,
        ...verifiedKwargs,
      };
      processChain.push({
        type: 'jump_out',
        target: 'actionchain',
        main_key: toolTag.actionchainMainKey,
      });
      this.dispatcher.eventchain.push(new Event(EventType.ACTION_CHAIN));
      return EventStatus.COMPLETE;
    }

    // Send executing indicator
    await this.event.propagateMsg(
      new AiIdleTemplate([I18n.AI_REACT_ACT]),
      undefined,
      undefined,
      FlowMsgType.THINK_L2,
    );

    // Execute tool
    let observation: ToolResult;
    try {
      observation = await ToolClass.run(this.dispatcher, this.event, ...Object.values(verifiedKwargs));
    } catch (err) {
      logger.error({ msg: `Tool ${actionName} execution failed`, err });
      observation = { success: false, error: String(err) };
    }

    // Append observation to process chain
    processChain.push({
      type: 'observation',
      tool: actionName,
      ...observation,
    });

    // Continue to next planning round
    this.dispatcher.eventchain.push(new Event(EventType.REACT_PLAN));
    return EventStatus.COMPLETE;
  }
}
