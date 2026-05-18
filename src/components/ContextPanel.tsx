import React from 'react';
import { Activity, Brain, Fingerprint, Trash2 } from 'lucide-react';
import { useAppContext } from '../store/AppContext';

export const ContextPanel: React.FC = () => {
  const {
    persona,
    learnedUrls,
    memories,
    scripts,
    deleteMemory,
  } = useAppContext();

  const handleDeleteMemory = async (id: string) => {
    const ok = window.confirm('確定要刪除這筆記憶嗎？刪除後不會再參與後續生成。');
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
        {persona && (
          <section className="context-card">
            <div className="section-label"><Fingerprint size={14} /> 人設摘要</div>
            <div className="persona-summary">
              <strong>{persona.brandName}</strong>
              <span>{persona.role}</span>
              <div className="chip-row">
                {persona.industry && <span className="badge">{persona.industry}</span>}
                {persona.platforms.slice(0, 2).map((platform) => <span key={platform} className="badge">{platform}</span>)}
              </div>
            </div>
          </section>
        )}

        <section className="context-card">
          <div className="section-label"><Brain size={14} /> HERMES 主流程</div>
          <div className="metric-row">
            <span>AI 模式</span>
            <strong>真 LLM</strong>
          </div>
          <div className="metric-row">
            <span>學習資料</span>
            <strong>{learnedUrls.length} 筆</strong>
          </div>
          <div className="metric-row">
            <span>腳本草稿</span>
            <strong>{scripts.length} 筆</strong>
          </div>
          <div className="metric-row">
            <span>手動記憶</span>
            <strong>{memories.length} 筆</strong>
          </div>
        </section>

        {Boolean(persona?.tones?.length) && (
          <section className="context-card">
            <div className="section-label">語氣設定</div>
            <div className="chip-row">
              {(persona?.tones || []).slice(0, 6).map((tone) => <span className="badge" key={tone}>{tone}</span>)}
            </div>
          </section>
        )}

        {persona?.ctaMethod && (
          <section className="context-card">
            <div className="section-label">CTA 設定</div>
            <p className="compact-text">{persona.ctaMethod}</p>
          </section>
        )}

        {memories.length > 0 && (
          <section className="context-card">
            <div className="section-label">手動記憶</div>
            <div className="memory-list">
              {memories.slice(0, 5).map((memory) => (
                <div className="memory-item" key={memory.id}>
                  <span>{memory.content}</span>
                  <button className="icon-button danger" type="button" onClick={() => handleDeleteMemory(memory.id)} aria-label="刪除記憶">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
};
