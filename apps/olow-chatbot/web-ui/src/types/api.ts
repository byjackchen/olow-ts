/** SSE event types matching the backend olow-engine schema. */

export interface StreamDeltaMsg {
  message_type: 'think_l1' | 'think_l2' | 'think_l3' | 'answer' | 'navigate';
  delta: string;
  is_complete: boolean;
}

export interface DecodedMsg {
  message_type: string | null;
  message: string | Record<string, unknown> | unknown[] | null;
  format_type: string | null;
  sent_to_type: string | null;
  sent_to: string | null;
}

export interface FlowStates {
  react: { process_chain: unknown[]; [key: string]: unknown };
  [key: string]: unknown;
}

export type SSEEvent =
  | { type: 'stream_delta'; data: StreamDeltaMsg }
  | { type: 'message'; data: DecodedMsg }
  | { type: 'states'; data: FlowStates };

// ---------------------------------------------------------------------------
// App-level types
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ThinkingContent {
  l1?: string;
  l2?: string;
  l3?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: ThinkingContent;
  timestamp: number;
  isStreaming?: boolean;
}
