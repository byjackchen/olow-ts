// ═══════════════════ @olow/messengers — Public API ═══════════════════

// Factory
export { Messenger } from './factory.js';

// Messenger implementations
export { WebBotMessenger } from './web-bot.messenger.js';
export { StubMessenger } from './stub.messenger.js';

// Templates
export {
  TextTemplate, AgentSupportConfirmTemplate,
  AiIdleTemplate, AiReActAnswerTemplate,
  BackToMenuFooter,
  SingleMediaTemplate,
  GuestWifiTemplate,
  I18n, i18n,
  type Recommendation,
} from './templates/index.js';
