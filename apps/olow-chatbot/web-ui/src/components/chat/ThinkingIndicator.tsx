import { useState, useEffect } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { ThinkingContent } from '../../types/api';

interface ThinkingIndicatorProps {
  thinking: ThinkingContent;
  isStreaming: boolean;
  streamingL1?: string;
  streamingL2?: string;
  streamingL3?: string;
}

export function ThinkingIndicator({
  thinking,
  isStreaming,
  streamingL1,
  streamingL2,
  streamingL3,
}: ThinkingIndicatorProps) {
  // Auto-expand during streaming, auto-collapse when done
  const [expanded, setExpanded] = useState(false);

  // When streaming ends, collapse the thinking section
  useEffect(() => {
    if (!isStreaming) {
      setExpanded(false);
    }
  }, [isStreaming]);

  const l1 = streamingL1 || thinking.l1 || '';
  const l2 = streamingL2 || thinking.l2 || '';
  const l3 = streamingL3 || thinking.l3 || '';

  const hasDetail = l2 || l3;

  return (
    <div className="mb-2">
      {/* Status line: animated spinner + l1 text during streaming */}
      {isStreaming && l1 && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 size={14} className="animate-spin" />
          <span>{l1}</span>
        </div>
      )}

      {/* Collapsible detail section */}
      {hasDetail && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-gray-500 transition-colors duration-150 hover:text-gray-300"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>{expanded ? 'Hide thinking' : 'Show thinking'}</span>
          </button>

          {expanded && (
            <div className="mt-2 rounded-md border border-gray-700/50 bg-gray-800/50 p-3">
              {l2 && (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-500">
                  {l2}
                </pre>
              )}
              {l3 && (
                <pre className="mt-2 whitespace-pre-wrap border-t border-gray-700/30 pt-2 font-mono text-xs leading-relaxed text-gray-500">
                  {l3}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
