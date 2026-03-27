// ═══════════════════ @olow/core-flows — Public API ═══════════════════

// Config
export { setReactAgentConfig, getReactAgentConfig, type ReactAgentConfig } from './config.js';
export { setTriageConfig, getTriageConfig, type TriageConfig } from './triage-config.js';

// Templates
export { setReactTemplateProvider, getReactTemplateProvider, type IReactTemplateProvider } from './templates.js';

// Events
export { ReactEventType, AgentEventType, TriageEventType } from './events.js';

// Prompts
export { reactIntentPrompt, reactPlanPrompt, reactResponsePrompt, navigatePrompt } from './prompts.js';

// ReAct Flows (auto-register via @flowRegistry.register() on import)
export { ReactIntentFlow } from './intent.flow.js';
export { ReactPrecallFlow } from './precall.flow.js';
export { ReactPlanFlow } from './plan.flow.js';
export { ReactActFlow } from './act.flow.js';
export { ReactResponseFlow } from './response.flow.js';

// Agent Flows
export { OcrFlow } from './ocr.flow.js';
export { ReactNavigateFlow, AiNavigateTemplate, setNavItems, getNavItems, type NavItem } from './navigate.flow.js';

// Triage Flow
export { TriageFlow } from './triage.flow.js';
