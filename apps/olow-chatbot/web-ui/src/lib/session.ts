/**
 * Session and message persistence backed by `localStorage`.
 *
 * Keys:
 * - `olow-sessions`              — JSON array of `Session` objects
 * - `olow-messages-{sessionId}`  — JSON array of `Message` objects
 */

import type { Message, Session } from '../types/api';

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const SESSIONS_KEY = 'olow-sessions';
const messagesKey = (sessionId: string) => `olow-messages-${sessionId}`;

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Session[];
  } catch {
    return [];
  }
}

export function saveSession(session: Session): void {
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter((s) => s.id !== id);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  deleteMessages(id);
}

// ---------------------------------------------------------------------------
// Message CRUD
// ---------------------------------------------------------------------------

export function loadMessages(sessionId: string): Message[] {
  try {
    const raw = localStorage.getItem(messagesKey(sessionId));
    if (!raw) return [];
    return JSON.parse(raw) as Message[];
  } catch {
    return [];
  }
}

export function saveMessages(sessionId: string, messages: Message[]): void {
  localStorage.setItem(messagesKey(sessionId), JSON.stringify(messages));
}

export function deleteMessages(sessionId: string): void {
  localStorage.removeItem(messagesKey(sessionId));
}
