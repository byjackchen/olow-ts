// @olow/navigate-agent — Navigation suggestion flow

// Templates
export { setNavigateTemplateProvider, getNavigateTemplateProvider, type INavigateTemplateProvider } from './templates.js';

// Prompts
export { navigatePrompt } from './prompts.js';

// Flows (auto-register via @flowRegistry.register() on import)
export { NavigateFlow } from './navigate.flow.js';
