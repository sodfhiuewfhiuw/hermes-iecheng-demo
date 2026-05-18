import React from 'react';
import { useAppContext } from '../store/AppContext';
import { FileText, Film, Library, Users } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeView, setActiveView } = useAppContext();

  const navItems = [
    { id: 'persona', label: '人設設定', icon: Users },
    { id: 'learn-url', label: '文字學習', icon: FileText },
    { id: 'workbench', label: '腳本工作台', icon: Film },
    { id: 'library', label: '腳本庫', icon: Library },
  ] as const;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand-logo brand-logo-text">H</div>
        <div className="brand-copy">
          <div className="brand-title">IE獅夢遊行銷</div>
          <div className="brand-subtitle">短影音腳本生成器</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => setActiveView(item.id)}
              type="button"
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">Demo Workspace</div>
    </aside>
  );
};
