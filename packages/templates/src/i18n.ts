import type { Language } from '@olow/engine';

export type I18nEntry = Record<Language, string>;

export function i18n(entries: I18nEntry): (lang?: Language) => string {
  return (lang?: Language) => entries[lang ?? 'en'] ?? entries['en']!;
}

export const I18n = {
  BOT_ENGINE_PANIC: i18n({ en: 'Sorry, something went wrong. Please try again.', cn: '抱歉，系统出现了问题。请稍后再试。' }),
  CLICK_01: i18n({ en: 'This button is no longer valid: ', cn: '此按钮已失效：' }),
  GREETING: i18n({ en: 'Hi! How can I help you today?', cn: '你好！有什么我可以帮助你的吗？' }),
  BACK_TO_MENU: i18n({ en: 'Back to Menu', cn: '返回菜单' }),
  HELPFUL_YES: i18n({ en: 'Helpful', cn: '有帮助' }),
  HELPFUL_NO: i18n({ en: 'Not Helpful', cn: '没有帮助' }),
  BOT_PEAK_SHAVING: i18n({ en: 'We are experiencing high traffic. Please try again in a moment.', cn: '当前访问量较大，请稍后再试。' }),
  AI_INTENT: i18n({ en: 'Analyzing your request...', cn: '正在分析您的请求...' }),
  AI_REACT_PLAN: i18n({ en: 'Planning the best approach...', cn: '正在规划最佳方案...' }),
  AI_REACT_ACT: i18n({ en: 'Executing...', cn: '正在执行...' }),
  AI_REACT_RESPONSE_CLAIM: i18n({ en: 'Here is what I found:', cn: '以下是我找到的信息：' }),
  ACTIONCHAIN_CANCELLED: i18n({ en: 'The workflow has been cancelled.', cn: '工作流已取消。' }),
  ACTIONCHAIN_CANCELLED_GENERIC: i18n({ en: 'The workflow has been cancelled.', cn: '工作流已取消。' }),
  AGENT_SUPPORT_CONFIRM: i18n({ en: 'Would you like to connect with a live agent?', cn: '您是否需要转接人工客服？' }),
  FAQ_FEEDBACK_CONFIRM: i18n({ en: 'Thank you for your feedback! Would you like to provide more details?', cn: '感谢您的反馈！您是否愿意提供更多细节？' }),
  GENERAL_FEEDBACK_CONFIRM: i18n({ en: 'Thank you for your feedback!', cn: '感谢您的反馈！' }),
  NO_ANSWER_FALLBACK: i18n({ en: 'I apologize, but I was unable to find a satisfactory answer. Would you like to try rephrasing your question or connect with a live agent?', cn: '抱歉，我未能找到满意的答案。您是否需要换个方式提问或转接人工客服？' }),
} as const;
