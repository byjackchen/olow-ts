import type { ITemplate, Language } from '@olow/engine';
import { AiIdleTemplate, AiReActAnswerTemplate, TextTemplate, I18n, type Recommendation } from '@olow/messengers';

export interface IReactTemplateProvider {
  idle(text: string): ITemplate;
  text(lines: string[]): ITemplate;
  answer(opts: { cycleId: string; text: string; recommendations: unknown[]; lang?: Language }): ITemplate;
  i18n: {
    INTENT: (lang?: Language) => string;
    PLAN: (lang?: Language) => string;
    ACT: (lang?: Language) => string;
    NO_ANSWER: (lang?: Language) => string;
  };
}

// Default provider using @olow/templates
const DEFAULT_PROVIDER: IReactTemplateProvider = {
  idle: (text) => new AiIdleTemplate([text]),
  text: (lines) => new TextTemplate(lines),
  answer: (opts) => new AiReActAnswerTemplate({ ...opts, recommendations: opts.recommendations as Recommendation[] }),
  i18n: {
    INTENT: I18n.AI_INTENT,
    PLAN: I18n.AI_REACT_PLAN,
    ACT: I18n.AI_REACT_ACT,
    NO_ANSWER: I18n.NO_ANSWER_FALLBACK,
  },
};

let _provider: IReactTemplateProvider = DEFAULT_PROVIDER;

export function setReactTemplateProvider(provider: IReactTemplateProvider): void {
  _provider = provider;
}

export function getReactTemplateProvider(): IReactTemplateProvider {
  return _provider;
}
