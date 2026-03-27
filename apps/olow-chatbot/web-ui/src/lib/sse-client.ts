/**
 * Fetch-based SSE client for streaming chat responses.
 *
 * Uses `fetch()` + `ReadableStream` (NOT `EventSource`) because the backend
 * requires `POST` with an `Authorization` header — neither of which
 * `EventSource` supports.
 */

import type { DecodedMsg, FlowStates, StreamDeltaMsg } from '../types/api';
import { API_BASE, API_TOKEN } from './constants';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StreamChatParams {
  /** User's message text. */
  message: string;
  /** Unique user identifier. */
  userId: string;
  /** Site slug (maps to backend config). */
  site: string;
  /** Optional thread / session id for multi-turn context. */
  threadId?: string;
  /** `AbortSignal` for cancellation support. */
  signal?: AbortSignal;

  // Callbacks -----------------------------------------------------------------
  onDelta: (msg: StreamDeltaMsg) => void;
  onMessage: (msg: DecodedMsg) => void;
  onStates: (states: FlowStates) => void;
}

/**
 * Opens a streaming POST request to the chatbot backend and dispatches
 * parsed SSE events through the provided callbacks.
 *
 * Resolves when the stream is finished. Throws on HTTP / network errors.
 */
export async function streamChat(params: StreamChatParams): Promise<void> {
  const { message, userId, site, threadId, signal, onDelta, onMessage, onStates } = params;

  const url = `${API_BASE}/web_bot?mode=stream`;

  const body: Record<string, unknown> = {
    content: message,
    UserId: userId,
    Site: site,
  };
  if (threadId) {
    body.SessionId = threadId;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (API_TOKEN) {
    headers['Authorization'] = `Bearer ${API_TOKEN}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`SSE request failed: ${response.status} ${response.statusText} — ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by double newlines.  We split on every
      // complete frame boundary and keep any trailing incomplete chunk in
      // the buffer for the next iteration.
      const frames = buffer.split('\n\n');
      // The last element is either '' (if the buffer ended on a boundary)
      // or an incomplete frame that we need to keep.
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const parsed = parseSSEFrame(frame);
        if (!parsed) continue;

        switch (parsed.type) {
          case 'stream_delta':
            onDelta(parsed.data as StreamDeltaMsg);
            break;
          case 'message':
            onMessage(parsed.data as DecodedMsg);
            break;
          case 'states':
            onStates(parsed.data as FlowStates);
            break;
          // Silently ignore unknown event types for forward-compat.
        }
      }
    }

    // Flush any remaining buffered data (server may omit trailing newlines).
    if (buffer.trim()) {
      const parsed = parseSSEFrame(buffer);
      if (parsed) {
        switch (parsed.type) {
          case 'stream_delta':
            onDelta(parsed.data as StreamDeltaMsg);
            break;
          case 'message':
            onMessage(parsed.data as DecodedMsg);
            break;
          case 'states':
            onStates(parsed.data as FlowStates);
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ParsedEvent {
  type: string;
  data: unknown;
}

/**
 * Parses a single SSE frame (the text between double-newline boundaries).
 *
 * The backend sends frames in the form:
 * ```
 * data: {"type":"stream_delta","data":{...}}
 * ```
 *
 * Per the SSE spec, a frame may contain multiple `data:` lines which should
 * be concatenated with newlines.
 */
function parseSSEFrame(frame: string): ParsedEvent | null {
  const lines = frame.split('\n');
  const dataLines: string[] = [];

  for (const line of lines) {
    // Skip comments and non-data fields.
    if (line.startsWith('data:')) {
      // Strip the `data:` prefix.  Spec says a single space after colon is
      // optional and should be removed if present.
      const payload = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
      dataLines.push(payload);
    }
    // We intentionally ignore `event:`, `id:`, `retry:` fields — the
    // backend encodes the event type inside the JSON payload.
  }

  if (dataLines.length === 0) return null;

  const raw = dataLines.join('\n').trim();
  if (!raw || raw === '[DONE]') return null;

  try {
    const json = JSON.parse(raw) as { type?: string; data?: unknown };
    if (!json.type) return null;
    return { type: json.type, data: json.data };
  } catch {
    // Malformed JSON — skip this frame silently.
    return null;
  }
}
