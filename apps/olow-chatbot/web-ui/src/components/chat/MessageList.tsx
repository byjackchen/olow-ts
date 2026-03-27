import { useEffect, useRef } from 'react';
import type { Message } from '../../types/api';
import type { StreamingContent } from '../../hooks/useChat';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  streamingContent: StreamingContent;
}

export function MessageList({
  messages,
  isStreaming,
  streamingContent,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when messages change or content streams in
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming, streamingContent.answer]);

  return (
    <div className="flex-1 overflow-y-auto pb-4 pt-4">
      <div className="mx-auto max-w-3xl">
        {messages.map((message, index) => {
          // Determine if this is the last assistant message currently streaming
          const isLastAssistant =
            isStreaming &&
            message.role === 'assistant' &&
            index === messages.length - 1;

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isStreaming={isLastAssistant}
              streamingContent={isLastAssistant ? streamingContent : undefined}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
