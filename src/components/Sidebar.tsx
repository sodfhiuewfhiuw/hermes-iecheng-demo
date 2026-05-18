import React from 'react';
import { FileText, Film, Library, MessageSquare, Users } from 'lucide-react';
import { useAppContext } from '../store/AppContext';

export const Sidebar: React.FC = () => {
  const { activeView, setActiveView, authUser } = useAppContext();

  const navItems = [
    { id: 'persona', label: '人設設定', icon: Users },
    { id: 'learn-url', label: '文字資料學習', icon: FileText },
    { id: 'room', label: 'HERMES 小房間', icon: MessageSquare },
    { id: 'workbench', label: '腳本工作台', icon: Film },
    { id: 'library', label: '腳本庫', icon: Library },
  ] as const;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img className="brand-logo" src="/src/assets/brand/ie-lion-logo.jpg" alt="IE 獅夢遊行銷" />
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

      <div className="sidebar-footer">
        {authUser ? `已登入：${authUser.email}` : 'Supabase Auth 尚未登入'}
      </div>
    </aside>
  );
};
