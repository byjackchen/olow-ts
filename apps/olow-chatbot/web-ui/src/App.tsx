import { useState } from 'react';
import { useChat } from './hooks/useChat';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ChatView } from './components/chat/ChatView';

function App() {
  const chat = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

  const currentSession = chat.sessions.find((s) => s.id === chat.activeSessionId);
  const title = currentSession?.title ?? 'New Chat';

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Sidebar */}
      <Sidebar
        sessions={chat.sessions}
        activeSessionId={chat.activeSessionId}
        onNewChat={chat.createSession}
        onSelectSession={chat.selectSession}
        onDeleteSession={chat.deleteSession}
        isOpen={sidebarOpen}
        onToggle={toggleSidebar}
      />

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
