import React from 'react';
import { Activity, Brain, Fingerprint, Trash2 } from 'lucide-react';
import { useAppContext } from '../store/AppContext';

export const ContextPanel: React.FC = () => {
  const {
    persona,
    learnedUrls,
    memories,
    scripts,
    roomState,
    roomDocuments,
    roomDrafts,
    deleteMemory,
    deleteRoomMemory,
  } = useAppContext();

  const handleDeleteMemory = async (id: string) => {
    const ok = window.confirm('刪除後，這筆記憶不再參與後續生成。確定刪除？');
    if (!ok) return;
    if (roomState) await deleteRoomMemory(id);
    else await deleteMemory(id);
  };

  return (
    <aside className="context-panel">
      <div className="context-header">
        <Activity size={18} color="var(--primary)" />
        <span>小房間狀態</span>
      </div>

      <div className="context-body">
        {persona && (
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
        )}

        <section className="context-card">
          <div className="section-label"><Brain size={14} /> Runtime State</div>
          <div className="metric-row">
            <span>目前階段</span>
            <strong>{roomState?.currentStage || 'demo fallback'}</strong>
          </div>
          <div className="metric-row">
            <span>學習資料</span>
            <strong>{roomDocuments.length || learnedUrls.length} 筆</strong>
          </div>
          <div className="metric-row">
            <span>腳本草稿</span>
            <strong>{roomDrafts.length || scripts.length} 筆</strong>
          </div>
          <div className="metric-row">
            <span>手動記憶</span>
            <strong>{memories.length} 筆</strong>
          </div>
        </section>

        {roomState?.voiceDna && Object.keys(roomState.voiceDna).length > 0 && (
          <section className="context-card">
            <div className="section-label">voice_dna</div>
            <p className="compact-text">{roomState.voiceDna.brandVoice || '尚未明確'}</p>
            <p className="compact-text">{roomState.voiceDna.speakingRhythm}</p>
            <div className="chip-row">
              {(roomState.voiceDna.commonPhrases || []).slice(0, 4).map((phrase) => <span className="badge" key={phrase}>{phrase}</span>)}
            </div>
          </section>
        )}

        {roomState?.storyBeats && Object.keys(roomState.storyBeats).length > 0 && (
          <section className="context-card">
            <div className="section-label">故事骨架</div>
            {Object.entries(roomState.storyBeats).map(([key, value]) => (
              <div className="small-kv" key={key}>
                <span>{key}</span>
                <strong>{String(value)}</strong>
              </div>
            ))}
          </section>
        )}

        {memories.length > 0 && (
          <section className="context-card">
            <div className="section-label">最近記憶</div>
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
