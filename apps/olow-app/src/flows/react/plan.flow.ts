import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
const logger = getLogger();
import { AiIdleTemplate } from '../../templates/ai.template.js';
import { TextTemplate } from '../../templates/text.template.js';
import { I18n } from '../../templates/i18n.js';
import { config } from '../../config/index.js';
import * as promptKit from '../../kits/prompt.kit.js';

@flowRegistry.register()
export class ReactPlanFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === EventType.REACT_PLAN;
  }

  async run(): Promise<EventStatus> {
    const userId = this.request.requester.id;
    logger.info(`ReactPlanFlow planning for user ${userId}`);

    const reactStates = this.dispatcher.states.react;
    const processChain = reactStates.process_chain;
    const maxRounds = config.engine.react_agent.max_rounds;

    // Increment round counter
    reactStates.rounds_count = (reactStates.rounds_count ?? 0) + 1;
    const currentRound = reactStates.rounds_count;

    if (currentRound > maxRounds) {
      logger.warn(`Max rounds (${maxRounds}) exceeded, forcing response`);
      this.dispatcher.eventchain.push(new Event(EventType.REACT_RESPONSE));
      return EventStatus.COMPLETE;
    }

    // Build available tools for prompt
    const availableTools = (reactStates.available_tools ?? []).map((t) => ({
      name: (t as Record<string, unknown>)['name'] as string,
      description: (t as Record<string, unknown>)['description'] as string,
    }));

    // Extract the question from process chain
    const questionEntry = processChain.find(
      (e) => (e as Record<string, unknown>)['type'] === 'question',
    ) as Record<string, unknown> | undefined;
    const question = (questionEntry?.['question'] as string) ?? this.request.content.mixedText;

    // Build planning prompt
    const planPrompt = promptKit.reactPlanPrompt(question, availableTools);

    // Send thinking indicator
    await this.event.propagateMsg(
      new AiIdleTemplate([I18n.AI_REACT_PLAN]),
      undefined,
      undefined,
      FlowMsgType.THINK_L1,
    );

    // Call LLM with streaming if available
    let success = false;
    let result: unknown = null;

    try {
      if (this.event.msgQueue) {
        // Try streaming first — cast queue for broker compatibility
        const queue = this.event.msgQueue as unknown as { put: (msg: unknown) => Promise<void> };
        [success, result] = await this.broker.llm.callLlmStream(
          planPrompt,
          queue,
          { jsonMode: 'json_fence' },
        );
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

    // Append thought to process chain
    if (thought) {
      processChain.push({ type: 'thought', thought });
    }

    // Route based on LLM response
    if (toolCalls && toolCalls.length > 0 && !finalAnswer) {
      // Tool call needed
      const firstCall = toolCalls[0]!;
      const actionName = firstCall['tool'] as string;
      const actionInput = (firstCall['parameters'] as Record<string, unknown>) ?? {};

      processChain.push({
        type: 'action',
        action: actionName,
        action_input: actionInput,
      });

      // Notify about tool being called
      const toolClass = this.dispatcher.toolsMap.get(actionName) as { toolTag?: { labelName: string } } | undefined;
      const toolLabel = toolClass?.toolTag?.labelName ?? actionName;
      await this.event.propagateMsg(
        new TextTemplate([`🔧 ${toolLabel}`]),
        undefined,
        undefined,
        FlowMsgType.THINK_L2,
      );

      this.dispatcher.eventchain.push(new Event(EventType.REACT_ACT));
    } else if (finalAnswer) {
      processChain.push({
        type: 'final_answer',
        final_answer: finalAnswer,
        main_sources: parsed['main_sources'],
        other_sources: parsed['other_sources'],
      });
      this.dispatcher.eventchain.push(new Event(EventType.REACT_RESPONSE));
    } else if (clarification) {
      processChain.push({
        type: 'clarification',
        clarification,
      });
      this.dispatcher.eventchain.push(new Event(EventType.REACT_RESPONSE));
    } else {
      // No clear action — force response
      logger.warn('Plan produced no action, final_answer, or clarification');
      this.dispatcher.eventchain.push(new Event(EventType.REACT_RESPONSE));
    }

    return EventStatus.COMPLETE;
  }
}
