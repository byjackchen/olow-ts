import type { ITemplate, Language } from '@olow/engine';

export interface INavigateTemplateProvider {
  text(lines: string[]): ITemplate;
  i18n: {
    NAVIGATE_OPTIONS: (lang?: Language) => string;
  };
}

let _provider: INavigateTemplateProvider | null = null;

export function setNavigateTemplateProvider(provider: INavigateTemplateProvider): void {
  _provider = provider;
}

export function getNavigateTemplateProvider(): INavigateTemplateProvider {
  if (!_provider) {
    throw new Error('@olow/navigate-agent: template provider not set. Call setNavigateTemplateProvider() at startup.');
  }
  return _provider;
}
