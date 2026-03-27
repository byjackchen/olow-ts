import { useState, useEffect } from 'react';
import { useChat } from './hooks/useChat';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ChatView } from './components/chat/ChatView';

function App() {
  const chat = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const currentSession = chat.sessions.find((s) => s.id === chat.activeSessionId);
  const title = currentSession?.title ?? 'New Chat';

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          isMobile
            ? `fixed inset-y-0 left-0 z-30 transition-transform duration-200 ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : sidebarOpen
              ? 'relative'
              : 'hidden'
        }`}
      >
        <Sidebar
          sessions={chat.sessions}
          activeSessionId={chat.activeSessionId}
          onNewChat={chat.createSession}
          onSelectSession={chat.selectSession}
          onDeleteSession={chat.deleteSession}
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        <Header title={title} onToggleSidebar={toggleSidebar} />
        <ChatView
          sessions={chat.sessions}
          activeSessionId={chat.activeSessionId}
          messages={chat.messages}
          isStreaming={chat.isStreaming}
          streamingContent={chat.streamingContent}
          sendMessage={chat.sendMessage}
          createSession={chat.createSession}
          selectSession={chat.selectSession}
          deleteSession={chat.deleteSession}
          stopStreaming={chat.stopStreaming}
        />
      </div>
    </div>
  );
}

export default App;
