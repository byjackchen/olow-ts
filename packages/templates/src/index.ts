// ═══════════════════ @olow/templates — Public API ═══════════════════

// Factory
export { Templates } from './factory.js';

// Template implementations (auto-register via @templateRegistry.register() on import)
export { TextTemplate, AgentSupportConfirmTemplate } from './text.js';
export { AiIdleTemplate, AiReActAnswerTemplate, type Recommendation } from './ai.js';
export { BackToMenuFooter } from './footer.js';
export { SingleMediaTemplate } from './media.js';
export { ActionChainCardTemplate, type ProgressItem } from './actionchain-card.js';

// I18n
export { I18n, i18n, type I18nEntry } from './i18n.js';
