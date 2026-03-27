import { Sparkles } from 'lucide-react';

interface EmptyStateProps {
  onSend: (content: string) => void;
}

const EXAMPLE_PROMPTS = [
  'Explain quantum computing in simple terms',
  'Write a Python function to merge two sorted lists',
  'What are the best practices for REST API design?',
  'Help me brainstorm ideas for a mobile app',
];

export function EmptyState({ onSend }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/20">
        <Sparkles size={24} className="text-indigo-400" />
      </div>

      <h1 className="mb-1 text-2xl font-semibold text-gray-100">Olow AI</h1>
      <p className="mb-8 text-sm text-gray-400">How can I help you today?</p>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSend(prompt)}
            className="rounded-xl border border-gray-700/50 bg-gray-800/50 px-4 py-3 text-left text-sm text-gray-300 transition-colors duration-150 hover:border-gray-600 hover:bg-gray-800 hover:text-gray-100"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
