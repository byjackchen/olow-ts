import {
  CoreEventType, CoreActionType,
  registerSystemActionParser, registerEventRouter,
} from '@olow/engine';
import { ReactEventType } from '@olow/react-agent';

// ─── App Event Types ───

export const AppEventType = {
  GREETING: 'greeting',
  CLICK: 'click',
  MENU: 'menu',
  EXPAND_FAQ: 'expand_faq',
  GROUPCHAT_QUERY: 'groupchat_query',
  GROUPCHAT_CLICK: 'groupchat_click',
  ASR: 'asr',
  OCR: 'ocr',
  AGENT_SUPPORT: 'agent_support',
  TICKET_PUSH: 'ticket_push',
  QUICK_TICKET: 'quick_ticket',
  AGENT_POOL_PUSH: 'agent_pool_notice',
  CACHE_SYNC: 'cache_sync',
  SN_SYNC_FAQ: 'sn_sync_faq',
  USER_DETAILS: 'user_details',
  NOTIFICATION: 'notification',
  BOTJOBS: 'BOTJOBS',
  BOT_SERVICES_USER: 'bot_services_user',
  BOT_SERVICES_TICKET: 'bot_services_ticket',
  BOT_SERVICES_NOTIFICATION: 'bot_services_notification',
} as const;

// ─── App Action Types ───

export const AppActionType = {
  SN_TICKET_CLOSE: 'sn_ticket_close',
  SN_TICKET_REASSIGN: 'sn_ticket_reassign',
  SN_TICKET_SOLPROPOSED: 'sn_ticket_solproposed',
  SN_TICKET_UNASSIGN: 'sn_ticket_unassign',
  SN_TICKET_ONHOLD: 'sn_ticket_onhold',
  SN_TICKET_SURVEY: 'sn_ticket_survey',
  SN_AGENT_ASSIGN: 'sn_agent_assign',
  SN_AGENT_LOGOUT: 'sn_agent_logout',
  SN_AGENT_BUSY: 'sn_agent_busy',
  CACHE_SYNC_TICKET: 'cache_sync_ticket',
  FAQ_DEPLOY: 'faq_deploy',
  FAQ_RECALL: 'faq_recall',
  FAQ_POLISH: 'faq_polish',
  FAQ_RECALL_ALL: 'faq_recall_all',
  NOTIFICATION: 'notification',
  BOTJOBS: 'BOTJOBS',
  BOT_SERVICES: 'bot_services',
} as const;

// ─── System Action Parser ───

const SYSTEM_ACTION_MAP: Record<string, Record<string, string>> = {
  ServiceNow: {
    ticketclosed: AppActionType.SN_TICKET_CLOSE,
    reassign: AppActionType.SN_TICKET_REASSIGN,
    ticketproposed: AppActionType.SN_TICKET_SOLPROPOSED,
    ticketonhold: AppActionType.SN_TICKET_ONHOLD,
    ticketsurvey: AppActionType.SN_TICKET_SURVEY,
    ticketupdate: AppActionType.CACHE_SYNC_TICKET,
    live_agent: AppActionType.SN_AGENT_ASSIGN,
    agentbusy: AppActionType.SN_AGENT_BUSY,
    agentlogout: AppActionType.SN_AGENT_LOGOUT,
    faq_deploy: AppActionType.FAQ_DEPLOY,
    faq_deploy_all: AppActionType.FAQ_DEPLOY,
    faq_recall: AppActionType.FAQ_RECALL,
    faq_recall_all: AppActionType.FAQ_RECALL_ALL,
    faq_polish: AppActionType.FAQ_POLISH,
    notification: AppActionType.NOTIFICATION,
    survey: AppActionType.NOTIFICATION,
  },
};

registerSystemActionParser((msg) => {
  const source = msg['source'] as string | undefined;
  const type = msg['type'] as string | undefined;

  if (source && source in SYSTEM_ACTION_MAP && type) {
    return SYSTEM_ACTION_MAP[source]![type] ?? null;
  }
  if (source === 'BotJobs') {
    return type === 'ticketunassign' ? AppActionType.SN_TICKET_UNASSIGN : AppActionType.BOTJOBS;
  }
  if (source === 'BotServices') {
    return AppActionType.BOT_SERVICES;
  }
  return null;
});

// ─── Event Router ───

const SYSTEM_EVENT_MAP: Record<string, string> = {
  [AppActionType.SN_TICKET_CLOSE]: AppEventType.TICKET_PUSH,
  [AppActionType.SN_TICKET_SURVEY]: AppEventType.TICKET_PUSH,
  [AppActionType.SN_TICKET_REASSIGN]: AppEventType.TICKET_PUSH,
  [AppActionType.SN_TICKET_SOLPROPOSED]: AppEventType.TICKET_PUSH,
  [AppActionType.SN_TICKET_UNASSIGN]: AppEventType.TICKET_PUSH,
  [AppActionType.SN_TICKET_ONHOLD]: AppEventType.TICKET_PUSH,
  [AppActionType.CACHE_SYNC_TICKET]: AppEventType.CACHE_SYNC,
  [AppActionType.FAQ_DEPLOY]: AppEventType.SN_SYNC_FAQ,
  [AppActionType.FAQ_RECALL]: AppEventType.SN_SYNC_FAQ,
  [AppActionType.FAQ_RECALL_ALL]: AppEventType.SN_SYNC_FAQ,
  [AppActionType.FAQ_POLISH]: AppEventType.SN_SYNC_FAQ,
  [AppActionType.SN_AGENT_ASSIGN]: AppEventType.AGENT_POOL_PUSH,
  [AppActionType.SN_AGENT_BUSY]: AppEventType.AGENT_POOL_PUSH,
  [AppActionType.SN_AGENT_LOGOUT]: AppEventType.AGENT_POOL_PUSH,
  [AppActionType.NOTIFICATION]: AppEventType.NOTIFICATION,
  [AppActionType.BOTJOBS]: AppEventType.BOTJOBS,
};

registerEventRouter((action, msg, channelType) => {
  // System events
  if (action in SYSTEM_EVENT_MAP) return SYSTEM_EVENT_MAP[action]!;

  if (action === AppActionType.BOT_SERVICES) {
    const domain = msg['domain'] as string;
    if (domain === 'user') return AppEventType.BOT_SERVICES_USER;
    if (domain === 'ticket') return AppEventType.BOT_SERVICES_TICKET;
    if (domain === 'notification') return AppEventType.BOT_SERVICES_NOTIFICATION;
  }

  // User events — single channel
  if (channelType === 'single') {
    if (action === CoreActionType.ENTER_CHAT) return AppEventType.GREETING;
    if (action === CoreActionType.COMMAND) return CoreEventType.COMMAND;
    if (action === CoreActionType.CLICK || action === CoreActionType.QUERY || action === CoreActionType.FILE) return CoreEventType.TRIAGE;
    if (action === CoreActionType.IMAGE || action === CoreActionType.MIXED) return AppEventType.OCR;
    if (action === CoreActionType.VOICE) return AppEventType.ASR;
  }

  // User events — group channel
  if (channelType === 'group') {
    if (action === CoreActionType.QUERY) return AppEventType.GROUPCHAT_QUERY;
    if (action === CoreActionType.CLICK) return AppEventType.GROUPCHAT_CLICK;
  }

  return null;
});
