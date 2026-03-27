/**
 * Core chat state management hook.
 *
 * Manages sessions (threads), messages, and SSE streaming — all persisted to
 * localStorage so conversations survive page reloads.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';

import type {
  DecodedMsg,
  FlowStates,
  Message,
  Session,
  StreamDeltaMsg,
  ThinkingContent,
} from '../types/api';
import { DEFAULT_SITE, DEFAULT_USER_ID } from '../lib/constants';
import { streamChat } from '../lib/sse-client';
import {
  deleteMessages as removeStoredMessages,
  deleteSession as removeStoredSession,
  loadMessages,
  loadSessions,
  saveMessages,
  saveSession,
} from '../lib/session';

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface StreamingContent {
  answer: string;
  l1: string;
  l2: string;
  l3: string;
}

export interface UseChatReturn {
  sessions: Session[];
  activeSessionId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: StreamingContent;

  sendMessage: (content: string) => void;
  createSession: () => string;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  stopStreaming: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat(): UseChatReturn {
  // -- Sessions ---------------------------------------------------------------
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const all = loadSessions();
    return all.length > 0 ? all[0]!.id : null;
  });

  // -- Messages for the active session ----------------------------------------
  const [messages, setMessages] = useState<Message[]>(() => {
    const all = loadSessions();
    const first = all[0];
    return first ? loadMessages(first.id) : [];
  });

  // -- Streaming state --------------------------------------------------------
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<StreamingContent>({
    answer: '',
    l1: '',
    l2: '',
    l3: '',
  });

  // AbortController for the in-flight request.
  const abortRef = useRef<AbortController | null>(null);

  // Keep a ref to activeSessionId so callbacks can read the latest value
  // without re-capturing every render.
  const activeIdRef = useRef(activeSessionId);
  activeIdRef.current = activeSessionId;

  // Keep a ref to messages for the same reason.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ---------------------------------------------------------------------------
  // Persist messages whenever they change
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (activeSessionId) {
      saveMessages(activeSessionId, messages);
    }
  }, [activeSessionId, messages]);

  // ---------------------------------------------------------------------------
  // Session helpers
  // ---------------------------------------------------------------------------

  const createSession = useCallback((): string => {
    const id = nanoid();
    const now = Date.now();
    const session: Session = {
      id,
      title: 'New chat',
      createdAt: now,
      updatedAt: now,
    };
    saveSession(session);
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(id);
    setMessages([]);
    return id;
  }, []);

  const selectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setMessages(loadMessages(id));
  }, []);

  const deleteSessionCb = useCallback(
    (id: string) => {
      // If we're deleting the active session, abort any in-flight stream.
      if (id === activeIdRef.current) {
        abortRef.current?.abort();
        setIsStreaming(false);
        setStreamingContent({ answer: '', l1: '', l2: '', l3: '' });
      }

      removeStoredSession(id);
      removeStoredMessages(id);

      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        // If we deleted the active session, switch to the next available.
        if (id === activeIdRef.current) {
          const nextSession = next[0];
          if (nextSession) {
            setActiveSessionId(nextSession.id);
            setMessages(loadMessages(nextSession.id));
          } else {
            setActiveSessionId(null);
            setMessages([]);
          }
        }
        return next;
      });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Stop streaming
  // ---------------------------------------------------------------------------

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);

    // Finalise the assistant message with whatever has been accumulated.
    setStreamingContent((sc) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.isStreaming) {
          const thinking: ThinkingContent = {};
          if (sc.l1) thinking.l1 = sc.l1;
          if (sc.l2) thinking.l2 = sc.l2;
          if (sc.l3) thinking.l3 = sc.l3;
          const finalised: Message = {
            ...last,
            content: sc.answer || last.content,
            thinking: Object.keys(thinking).length > 0 ? thinking : last.thinking,
            isStreaming: false,
          };
          return [...prev.slice(0, -1), finalised];
        }
        return prev;
      });
      return { answer: '', l1: '', l2: '', l3: '' };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Send a message
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    (content: string) => {
      const text = content.trim();
      if (!text) return;

      // Ensure we have an active session. Create one if none exists.
      let sessionId = activeIdRef.current;
      if (!sessionId) {
        sessionId = createSession();
      }

      const now = Date.now();

      // -- User message -------------------------------------------------------
      const userMsg: Message = {
        id: nanoid(),
        role: 'user',
        content: text,
        timestamp: now,
      };

      // -- Placeholder assistant message --------------------------------------
      const assistantMsg: Message = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        thinking: {},
        timestamp: now + 1,
        isStreaming: true,
      };

      const updatedMessages = [...messagesRef.current, userMsg, assistantMsg];
      setMessages(updatedMessages);

      // Auto-title the session from the first user message.
      const isFirstMessage =
        messagesRef.current.filter((m) => m.role === 'user').length === 0;
      if (isFirstMessage) {
        const title = text.length > 30 ? text.slice(0, 30) + '...' : text;
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, title, updatedAt: now } : s,
          ),
        );
        const existing = loadSessions().find((s) => s.id === sessionId);
        if (existing) {
          saveSession({ ...existing, title, updatedAt: now });
        }
      }

      // -- Start streaming ----------------------------------------------------
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      setStreamingContent({ answer: '', l1: '', l2: '', l3: '' });

      // Accumulators — mutated inside callbacks for performance.
      let accAnswer = '';
      let accL1 = '';
      let accL2 = '';
      let accL3 = '';

      const onDelta = (msg: StreamDeltaMsg) => {
        switch (msg.message_type) {
          case 'answer':
            accAnswer += msg.delta;
            break;
          case 'think_l1':
            accL1 += msg.delta;
            break;
          case 'think_l2':
            accL2 += msg.delta;
            break;
          case 'think_l3':
            accL3 += msg.delta;
            break;
          // 'navigate' deltas are intentionally ignored in the UI for now.
        }

        // Push to React state so the UI can render progressively.
        setStreamingContent({
          answer: accAnswer,
          l1: accL1,
          l2: accL2,
          l3: accL3,
        });
      };

      const onMessage = (msg: DecodedMsg) => {
        // Handle complete messages (non-streaming responses).
        if (msg.message_type === 'answer' && typeof msg.message === 'string') {
          accAnswer = msg.message;
          setStreamingContent({
            answer: accAnswer,
            l1: accL1,
            l2: accL2,
            l3: accL3,
          });
        }
      };

      const finalise = () => {
        const thinking: ThinkingContent = {};
        if (accL1) thinking.l1 = accL1;
        if (accL2) thinking.l2 = accL2;
        if (accL3) thinking.l3 = accL3;
        const hasTh = Object.keys(thinking).length > 0;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.isStreaming) {
            const finalised: Message = {
              ...last,
              content: accAnswer,
              thinking: hasTh ? thinking : undefined,
              isStreaming: false,
            };
            return [...prev.slice(0, -1), finalised];
          }
          return prev;
        });
        setIsStreaming(false);
        setStreamingContent({ answer: '', l1: '', l2: '', l3: '' });

        // Update session timestamp.
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, updatedAt: Date.now() } : s,
          ),
        );
      };

      const onStates = (_states: FlowStates) => {
        // The `states` event signals the stream is logically complete.
        finalise();
      };

      streamChat({
        message: text,
        userId: DEFAULT_USER_ID,
        site: DEFAULT_SITE,
        threadId: sessionId,
        signal: controller.signal,
        onDelta,
        onMessage,
        onStates,
      })
        .then(() => {
          // Stream may have ended without a `states` event — finalise anyway.
          // `finalise` is idempotent (it checks `isStreaming` on the message).
          finalise();
        })
        .catch((err: unknown) => {
          // AbortError is expected when the user cancels.
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('[useChat] streaming error:', err);
          // Mark the assistant message as failed.
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last.isStreaming) {
              const failed: Message = {
                ...last,
                content:
                  accAnswer ||
                  'Sorry, something went wrong. Please try again.',
                isStreaming: false,
              };
              return [...prev.slice(0, -1), failed];
            }
            return prev;
          });
          setIsStreaming(false);
          setStreamingContent({ answer: '', l1: '', l2: '', l3: '' });
        });
    },
    [createSession],
  );

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    sessions,
    activeSessionId,
    messages,
    isStreaming,
    streamingContent,

    sendMessage,
    createSession,
    selectSession,
    deleteSession: deleteSessionCb,
    stopStreaming,
  };
}
