import React from 'react';
import { useAppContext } from '../store/AppContext';
import { Activity, Brain, Fingerprint, Trash2 } from 'lucide-react';

export const ContextPanel: React.FC = () => {
  const { persona, learnedUrls, memories, scripts, deleteMemory } = useAppContext();

  if (!persona) {
    return <aside className="context-panel context-loading">載入狀態...</aside>;
  }

  const handleDeleteMemory = async (id: string) => {
    const ok = window.confirm('確定要刪除這筆手動記憶？刪除後，後續腳本不會再帶入它。');
    if (!ok) return;
    await deleteMemory(id);
  };

  return (
    <aside className="context-panel">
      <div className="context-header">
        <Activity size={18} color="var(--primary)" />
        <span>工作區狀態</span>
      </div>

      <div className="context-body">
        <section className="context-card">
          <div className="section-label"><Fingerprint size={14} /> 目前人設</div>
          <div className="persona-summary">
            <strong>{persona.brandName}</strong>
            <span>{persona.role}</span>
            <div className="chip-row">
              <span className="badge">{persona.industry}</span>
              {persona.platforms.slice(0, 2).map((platform) => <span key={platform} className="badge">{platform}</span>)}
            </div>
          </div>
        </section>

        <section className="context-card">
          <div className="section-label"><Brain size={14} /> Workspace 記憶</div>
          <div className="metric-row">
            <span>學習資料</span>
            <strong>{learnedUrls.length} 份</strong>
          </div>
          <div className="metric-row">
            <span>腳本草稿</span>
            <strong>{scripts.length} 份</strong>
          </div>
          <div className="metric-row">
            <span>手動記憶</span>
            <strong>{memories.length} 份</strong>
          </div>

          {memories.length > 0 && (
            <div className="memory-list">
              {memories.slice(0, 4).map((memory) => (
                <div className="memory-item" key={memory.id}>
                  <span>{memory.content}</span>
                  <button className="icon-button danger" type="button" onClick={() => handleDeleteMemory(memory.id)} aria-label="刪除記憶">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};
