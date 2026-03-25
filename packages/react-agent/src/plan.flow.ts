import {
  BaseFlow, Event, flowRegistry, getLogger,
  EventStatus, FlowMsgType,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { ReactEventType } from './events.js';
import { getReactAgentConfig } from './config.js';
import { getReactTemplateProvider } from './templates.js';
import { reactPlanPrompt } from './prompts.js';

const logger = getLogger();

@flowRegistry.register()
export class ReactPlanFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === ReactEventType.REACT_PLAN;
  }

  async run(): Promise<EventStatus> {
    const tpl = getReactTemplateProvider();
    const cfg = getReactAgentConfig();
    const reactStates = this.dispatcher.states.react;
    const processChain = reactStates.process_chain;

    reactStates.rounds_count = (reactStates.rounds_count ?? 0) + 1;
    if (reactStates.rounds_count > cfg.max_rounds) {
      logger.warn(`Max rounds (${cfg.max_rounds}) exceeded, forcing response`);
      this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_RESPONSE));
      return EventStatus.COMPLETE;
    }

    const availableTools = this.extractAvailableTools();
    const lang = this.request.language ?? 'en';
    const prompt = reactPlanPrompt(
      processChain,
      reactStates.user_preferences ?? [],
      availableTools,
      reactStates.rounds_count,
      cfg.max_rounds,
      lang,
    );

    if (reactStates.rounds_count === 1) {
      await this.event.propagateMsg(
        tpl.idle(tpl.i18n.PLAN()), undefined, undefined, FlowMsgType.THINK_L2,
      );
    }

    const [success, result] = await this.callLlm(prompt);

    if (!success || !result || typeof result !== 'object') {
      logger.error('Plan LLM returned invalid response, forcing response');
      this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_RESPONSE));
      return EventStatus.COMPLETE;
    }

    await this.routeResult(result as Record<string, unknown>, processChain);
    return EventStatus.COMPLETE;
  }

  private extractAvailableTools(): Array<{ name: string; description: string; parameters?: Record<string, { type?: string; required?: boolean; description?: string }> }> {
    return (this.dispatcher.states.react.available_tools ?? []).map((t) => {
      const tool = t as Record<string, unknown>;
      return {
        name: tool['name'] as string,
        description: tool['description'] as string,
        parameters: tool['parameters'] as Record<string, { type?: string; required?: boolean; description?: string }> | undefined,
      };
    });
  }

  private async callLlm(prompt: string): Promise<[boolean, unknown]> {
    try {
      if (this.event.msgQueue) {
        // Stream reasoning tokens (think_l2) but suppress content — we'll emit reasoning text after
        const queue = this.event.msgQueue as unknown as { put: (msg: unknown) => Promise<void> };
        return await this.broker.llm.callLlmStream(prompt, queue, { jsonMode: 'json_fence' });
      }
      return await this.broker.llm.callLlm(prompt, { jsonMode: 'json_fence' });
    } catch (err) {
      logger.error({ msg: 'Plan LLM call failed, retrying without stream', err });
      try {
        return await this.broker.llm.callLlm(prompt, { jsonMode: 'json_fence' });
      } catch (retryErr) {
        logger.error({ msg: 'Plan LLM retry also failed', err: retryErr });
        return [false, null];
      }
    }
  }

  private async routeResult(parsed: Record<string, unknown>, chain: unknown[]): Promise<void> {
    const tpl = getReactTemplateProvider();
    const thought = (parsed['thought'] as string) ?? (parsed['reasoning'] as string) ?? undefined;
    const finalAnswer = parsed['final_answer'] as string | undefined;
    const clarification = parsed['clarification'] as string | undefined;

    // Extract action — support both "action" (single) and "tool_calls" (array) formats
    let action = parsed['action'] as string | undefined;
    let actionInput = (parsed['action_input'] as Record<string, unknown>) ?? {};
    if (!action) {
      const toolCalls = parsed['tool_calls'] as Array<Record<string, unknown>> | undefined;
      if (toolCalls?.length) {
        const call = toolCalls[0]!;
        action = (call['tool'] as string) ?? (call['action'] as string);
        actionInput = (call['parameters'] as Record<string, unknown>) ?? (call['action_input'] as Record<string, unknown>) ?? {};
      }
    }

    if (thought) chain.push({ type: 'thought', thought });

    if (action && !finalAnswer) {
      chain.push({ type: 'action', action, action_input: actionInput });

      const toolClass = this.dispatcher.toolsMap.get(action) as { toolTag?: { labelName: string } } | undefined;
      await this.event.propagateMsg(
        tpl.text([`🔧 ${toolClass?.toolTag?.labelName ?? action}`]),
        undefined, undefined, FlowMsgType.THINK_L2,
      );
      this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_ACT));
    } else if (finalAnswer) {
      chain.push({
        type: 'final_answer', final_answer: finalAnswer,
        main_sources: parsed['main_sources'], other_sources: parsed['other_sources'],
      });
      this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_RESPONSE));
    } else if (clarification) {
      chain.push({ type: 'clarification', clarification });
      this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_RESPONSE));
    } else {
      logger.warn('Plan produced no action, final_answer, or clarification');
      this.dispatcher.eventchain.push(new Event(ReactEventType.REACT_RESPONSE));
    }
  }
}
