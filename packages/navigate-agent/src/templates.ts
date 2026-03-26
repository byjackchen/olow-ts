import type { ITemplate, Language } from '@olow/engine';
import { TextTemplate, I18n } from '@olow/messengers';

export interface INavigateTemplateProvider {
  text(lines: string[]): ITemplate;
  i18n: {
    NAVIGATE_OPTIONS: (lang?: Language) => string;
  };
}

// Default provider using @olow/templates
const DEFAULT_PROVIDER: INavigateTemplateProvider = {
  text: (lines) => new TextTemplate(lines),
  i18n: {
    NAVIGATE_OPTIONS: I18n.GREETING,
  },
};

let _provider: INavigateTemplateProvider = DEFAULT_PROVIDER;

export function setNavigateTemplateProvider(provider: INavigateTemplateProvider): void {
  _provider = provider;
}

export function getNavigateTemplateProvider(): INavigateTemplateProvider {
  return _provider;
}
