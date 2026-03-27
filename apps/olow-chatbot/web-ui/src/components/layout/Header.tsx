import { Menu } from 'lucide-react';

interface HeaderProps {
  title: string;
  onToggleSidebar: () => void;
}

export function Header({ title, onToggleSidebar }: HeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center border-b border-gray-700/50 bg-gray-900/50 px-3 backdrop-blur-sm">
      {/* Hamburger menu for mobile sidebar toggle */}
      <button
        type="button"
        onClick={onToggleSidebar}
        className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-800 hover:text-gray-200 md:hidden"
        title="Toggle sidebar"
      >
        <Menu size={18} />
      </button>

      {/* Session title */}
      <h1 className="truncate text-sm font-medium text-gray-200">
        {title}
      </h1>
    </header>
  );
}
