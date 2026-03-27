import { useState, useEffect } from 'react';
import { Loader2, ChevronDown, ChevronUp, BrainCircuit } from 'lucide-react';
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
  const [expanded, setExpanded] = useState(false);

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      setExpanded(false);
    }
  }, [isStreaming]);

  const l1 = streamingL1 || thinking.l1 || '';
  const l2 = streamingL2 || thinking.l2 || '';
  const l3 = streamingL3 || thinking.l3 || '';

  if (!l1 && !l2 && !l3) return null;

  return (
    <div className="mb-3 rounded-md border border-gray-700/40 bg-gray-800/30 px-3 py-2">
      {/* L1 — primary title / status */}
      {l1 && (
        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
          {isStreaming ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-indigo-400" />
          ) : (
            <BrainCircuit size={14} className="shrink-0 text-indigo-400" />
          )}
          <span>{l1}</span>
        </div>
      )}

      {/* L2 — secondary title / subtitle */}
      {l2 && (
        <p className="mt-1 pl-[22px] text-xs leading-relaxed text-gray-400">
          {l2}
        </p>
      )}

      {/* L3 — collapsible details */}
      {l3 && (
        <div className="mt-1.5 pl-[22px]">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-xs text-gray-500 transition-colors duration-150 hover:text-gray-300"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{expanded ? 'Hide details' : 'Show details'}</span>
          </button>

          {expanded && (
            <pre className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-gray-700/30 bg-gray-900/40 p-2 font-mono text-xs leading-relaxed text-gray-500">
              {l3}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
