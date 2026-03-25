import type { ITemplate, Language } from '@olow/engine';

export interface IReactTemplateProvider {
  aiIdle(text: string): ITemplate;
  text(lines: string[]): ITemplate;
  aiReActAnswer(opts: { cycleId: string; text: string; recommendations: unknown[]; lang?: Language }): ITemplate;
  i18n: {
    AI_INTENT: (lang?: Language) => string;
    AI_REACT_PLAN: (lang?: Language) => string;
    AI_REACT_ACT: (lang?: Language) => string;
    NO_ANSWER_FALLBACK: (lang?: Language) => string;
  };
}

let _templateProvider: IReactTemplateProvider | null = null;

export function setReactTemplateProvider(provider: IReactTemplateProvider): void {
  _templateProvider = provider;
}

export function getReactTemplateProvider(): IReactTemplateProvider {
  if (!_templateProvider) {
    throw new Error('React template provider not set. Call setReactTemplateProvider() at startup.');
  }
  return _templateProvider;
}
