// @olow/react-agent — ReAct reasoning agent flows

// Config
export { setReactAgentConfig, getReactAgentConfig, type ReactAgentConfig } from './config.js';

// Templates
export { setReactTemplateProvider, getReactTemplateProvider, type IReactTemplateProvider } from './templates.js';

// Events
export { ReactEventType } from './events.js';

// Prompts
export { reactIntentPrompt, reactPlanPrompt, reactResponsePrompt } from './prompts.js';

// Flows (auto-register via @flowRegistry.register() on import)
export { ReactIntentFlow } from './intent.flow.js';
export { ReactPrecallFlow } from './precall.flow.js';
export { ReactPlanFlow } from './plan.flow.js';
export { ReactActFlow } from './act.flow.js';
export { ReactResponseFlow } from './response.flow.js';
