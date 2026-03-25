import type { ITemplate, Language } from '@olow/engine';

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

let _provider: IReactTemplateProvider | null = null;

export function setReactTemplateProvider(provider: IReactTemplateProvider): void {
  _provider = provider;
}

export function getReactTemplateProvider(): IReactTemplateProvider {
  if (!_provider) {
    throw new Error('@olow/react-agent: template provider not set. Call setReactTemplateProvider() at startup.');
  }
  return _provider;
}
