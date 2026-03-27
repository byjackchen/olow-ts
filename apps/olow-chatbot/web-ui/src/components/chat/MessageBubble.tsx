import { Bot, User } from 'lucide-react';
import type { Message } from '../../types/api';
import type { StreamingContent } from '../../hooks/useChat';
import { MarkdownRenderer } from './MarkdownRenderer';
import { StreamingCursor } from './StreamingCursor';
import { ThinkingIndicator } from './ThinkingIndicator';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: StreamingContent;
}

export function MessageBubble({
  message,
  isStreaming = false,
  streamingContent,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  // Determine if we should show thinking
  const hasThinking =
    message.thinking?.l1 || message.thinking?.l2 || message.thinking?.l3;
  const hasStreamingThinking =
    isStreaming &&
    streamingContent &&
    (streamingContent.l1 || streamingContent.l2 || streamingContent.l3);
  const showThinking = hasThinking || hasStreamingThinking;

  // Determine display content
  const displayContent = isStreaming && streamingContent
    ? streamingContent.answer
    : message.content;

  // Collect images from streaming or finalised message
  const displayImages = isStreaming && streamingContent
    ? streamingContent.images
    : message.images ?? [];

  if (isUser) {
    return (
      <div className="flex justify-end gap-3 px-4 py-2">
        <div className="max-w-[70%] rounded-2xl bg-indigo-600 px-4 py-2.5 text-white">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/20">
          <User size={16} className="text-indigo-400" />
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex gap-3 px-4 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700/50">
        <Bot size={16} className="text-gray-300" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {/* Thinking indicator */}
        {showThinking && (
          <ThinkingIndicator
            thinking={message.thinking ?? {}}
            isStreaming={isStreaming}
            streamingL1={isStreaming ? streamingContent?.l1 : undefined}
            streamingL2={isStreaming ? streamingContent?.l2 : undefined}
            streamingL3={isStreaming ? streamingContent?.l3 : undefined}
          />
        )}

        {/* Message content */}
        {displayContent ? (
          <div className="text-sm">
            <MarkdownRenderer content={displayContent} />
            {isStreaming && <StreamingCursor />}
          </div>
        ) : isStreaming ? (
          <div className="text-sm">
            <StreamingCursor />
          </div>
        ) : null}

        {/* Images */}
        {displayImages.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {displayImages.map((img, i) => (
              <img
                key={i}
                src={img.dataUri}
                alt={img.name}
                className="max-w-full rounded-md border border-gray-700/50 bg-white"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
