import { useState } from 'react';
import { Plus, Trash2, MessageSquare, X } from 'lucide-react';
import type { Session } from '../../types/api';
import { APP_NAME } from '../../lib/constants';

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  isOpen,
  onToggle,
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Sort sessions by updatedAt descending (most recent first)
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-gray-900 transition-transform duration-200 ease-in-out
          md:static md:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Top: New Chat button */}
        <div className="flex items-center justify-between border-b border-gray-700/50 p-3">
          <button
            type="button"
            onClick={onNewChat}
            className="flex flex-1 items-center gap-2 rounded-lg border border-gray-700/50 px-3 py-2.5 text-sm text-gray-200 transition-colors duration-150 hover:bg-gray-800"
          >
            <Plus size={16} />
            <span>New Chat</span>
          </button>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={onToggle}
            className="ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-800 hover:text-gray-200 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Middle: Session list */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {sortedSessions.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-gray-500">
              No conversations yet
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sortedSessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const isHovered = hoveredId === session.id;

                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      onMouseEnter={() => setHoveredId(session.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`
                        group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150
                        ${isActive
                          ? 'bg-gray-700 text-gray-100'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }
                      `}
                    >
                      <MessageSquare size={14} className="shrink-0 opacity-50" />
                      <span className="flex-1 truncate">{session.title}</span>

                      {/* Delete button on hover */}
                      {isHovered && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation();
                              onDeleteSession(session.id);
                            }
                          }}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 transition-colors duration-150 hover:bg-gray-600 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        {/* Bottom: Branding */}
        <div className="border-t border-gray-700/50 px-4 py-3">
          <p className="text-xs text-gray-500">{APP_NAME}</p>
        </div>
      </aside>
    </>
  );
}
