// @olow/react-agent — ReAct reasoning agent flows

export { setReactTemplateProvider, getReactTemplateProvider, type IReactTemplateProvider } from './templates.js';
export { reactIntentPrompt, reactPlanPrompt, reactResponsePrompt } from './prompts.js';
export { ReactIntentFlow, setReactAgentConfig, type ReactAgentConfig } from './intent.flow.js';
export { ReactPrecallFlow } from './precall.flow.js';
export { ReactPlanFlow } from './plan.flow.js';
export { ReactActFlow } from './act.flow.js';
export { ReactResponseFlow } from './response.flow.js';

// Internal: used by plan.flow to access config without circular import
import type { ReactAgentConfig } from './intent.flow.js';
let _config: ReactAgentConfig = { intent_mode: 'multi-turns', max_rounds: 5 };
export function _setConfig(cfg: ReactAgentConfig): void { _config = cfg; }
export function _getReactConfig(): ReactAgentConfig { return _config; }

// Re-export setReactAgentConfig to also set the internal config
import { setReactAgentConfig as _origSet } from './intent.flow.js';
const originalSetReactAgentConfig = _origSet;
export function initReactAgent(cfg: ReactAgentConfig): void {
  originalSetReactAgentConfig(cfg);
  _config = cfg;
}
