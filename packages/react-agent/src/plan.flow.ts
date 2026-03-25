import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import { reactPlanPrompt } from './prompts.js';
import type { MessengerType } from '@olow/engine';
import { getReactTemplateProvider } from './templates.js';
import { _getReactConfig } from './index.js';
const logger = getLogger();

@flowRegistry.register()
export class ReactPlanFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_PLAN;
  }

  async run(): Promise<EventStatus> {
    const tpl = getReactTemplateProvider();
    const cfg = _getReactConfig();
    const userId = this.request.requester.id;
    logger.info(`ReactPlanFlow planning for user ${userId}`);

    const reactStates = this.dispatcher.states.react;
    const processChain = reactStates.process_chain;
    const maxRounds = cfg.max_rounds;

    reactStates.rounds_count = (reactStates.rounds_count ?? 0) + 1;
    const currentRound = reactStates.rounds_count;

    if (currentRound > maxRounds) {
      logger.warn(`Max rounds (${maxRounds}) exceeded, forcing response`);
      this.dispatcher.eventchain.push(new Event(EventType.REACT_RESPONSE));
      return EventStatus.COMPLETE;
    }

    const availableTools = (reactStates.available_tools ?? []).map((t) => ({
      name: (t as Record<string, unknown>)['name'] as string,
      description: (t as Record<string, unknown>)['description'] as string,
    }));

    const questionEntry = processChain.find(
      (e) => (e as Record<string, unknown>)['type'] === 'question',
    ) as Record<string, unknown> | undefined;
    const question = (questionEntry?.['question'] as string) ?? this.request.content.mixedText;

    const planPrompt = reactPlanPrompt(question, availableTools);

    await this.event.propagateMsg(
      tpl.aiIdle(tpl.i18n.AI_REACT_PLAN()),
      undefined, undefined, FlowMsgType.THINK_L1,
    );

    let success = false;
    let result: unknown = null;

    try {
      if (this.event.msgQueue) {
        const queue = this.event.msgQueue as unknown as { put: (msg: unknown) => Promise<void> };
        [success, result] = await this.broker.llm.callLlmStream(planPrompt, queue, { jsonMode: 'json_fence' });
      } else {
        [success, result] = await this.broker.llm.callLlm(planPrompt, { jsonMode: 'json_fence' });
      }
    } catch (err) {
      logger.error({ msg: 'Plan LLM call failed, retrying without stream', err });
      try {
        [success, result] = await this.broker.llm.callLlm(planPrompt, { jsonMode: 'json_fence' });
      } catch (retryErr) {
        logger.error({ msg: 'Plan LLM retry also failed', err: retryErr });
      }
    }

    if (!success || !result || typeof result !== 'object') {
      logger.error('Plan LLM returned invalid response, forcing response');
      this.dispatcher.eventchain.push(new Event(EventType.REACT_RESPONSE));
      return EventStatus.COMPLETE;
    }

    const parsed = result as Record<string, unknown>;
    const thought = parsed['reasoning'] as string | undefined;
    const toolCalls = parsed['tool_calls'] as Array<Record<string, unknown>> | undefined;
    const finalAnswer = parsed['final_answer'] as string | undefined;
    const clarification = parsed['clarification'] as string | undefined;

    if (thought) {
      processChain.push({ type: 'thought', thought });
    }

    if (toolCalls && toolCalls.length > 0 && !finalAnswer) {
      const firstCall = toolCalls[0]!;
      const actionName = firstCall['tool'] as string;
      const actionInput = (firstCall['parameters'] as Record<string, unknown>) ?? {};

      processChain.push({ type: 'action', action: actionName, action_input: actionInput });

      const toolClass = this.dispatcher.toolsMap.get(actionName) as { toolTag?: { labelName: string } } | undefined;
      const toolLabel = toolClass?.toolTag?.labelName ?? actionName;
      await this.event.propagateMsg(
        tpl.text([`🔧 ${toolLabel}`]),
        undefined, undefined, FlowMsgType.THINK_L2,
      );

      this.dispatcher.eventchain.push(new Event(EventType.REACT_ACT));
    } else if (finalAnswer) {
      processChain.push({
        type: 'final_answer', final_answer: finalAnswer,
        main_sources: parsed['main_sources'], other_sources: parsed['other_sources'],
      });
      this.dispatcher.eventchain.push(new Event(EventType.REACT_RESPONSE));
    } else if (clarification) {
      processChain.push({ type: 'clarification', clarification });
      this.dispatcher.eventchain.push(new Event(EventType.REACT_RESPONSE));
    } else {
      logger.warn('Plan produced no action, final_answer, or clarification');
      this.dispatcher.eventchain.push(new Event(EventType.REACT_RESPONSE));
    }

    return EventStatus.COMPLETE;
  }
}
