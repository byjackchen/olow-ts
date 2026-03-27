import { useState, useCallback, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  className?: string;
  children: ReactNode;
}

export function CodeBlock({ className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Extract language from className (e.g. "language-typescript" -> "typescript")
  const language = className?.replace(/^language-/, '') ?? '';

  const handleCopy = useCallback(async () => {
    const text =
      typeof children === 'string'
        ? children
        : (children as { props?: { children?: string } })?.props?.children ?? '';

    try {
      await navigator.clipboard.writeText(String(text));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in insecure contexts; silently ignore.
    }
  }, [children]);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-gray-700/50">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-[#2d2d2d] px-4 py-1.5 text-xs text-gray-400">
        <span className="select-none">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 transition-colors duration-150 hover:text-gray-200"
        >
          {copied ? (
            <>
              <Check size={14} />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <pre className="overflow-x-auto bg-[#1e1e1e] p-4 text-sm leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}
