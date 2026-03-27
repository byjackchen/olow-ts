import type { Message, Session } from '../../types/api';
import { ChatInput } from './ChatInput';
import { EmptyState } from './EmptyState';
import { MessageList } from './MessageList';

interface StreamingContent {
  answer: string;
  l1: string;
  l2: string;
  l3: string;
}

interface ChatViewProps {
  sessions: Session[];
  activeSessionId: string | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: StreamingContent;
  sendMessage: (content: string) => void;
  createSession: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  stopStreaming: () => void;
}

export function ChatView({
  messages,
  isStreaming,
  streamingContent,
  sendMessage,
  stopStreaming,
}: ChatViewProps) {
  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex h-full flex-col bg-gray-850">
      {isEmpty ? (
        <EmptyState onSend={sendMessage} />
      ) : (
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
        />
      )}

      <ChatInput
        onSend={sendMessage}
        onStop={stopStreaming}
        isStreaming={isStreaming}
      />
    </div>
  );
}
