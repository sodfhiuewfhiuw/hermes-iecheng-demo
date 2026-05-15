import React from 'react';
import { useAppContext } from '../store/AppContext';
import { FileText } from 'lucide-react';

export const ScriptLibraryView: React.FC = () => {
  const { scripts, updateScriptStatus } = useAppContext();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <span className="badge">草稿</span>;
      case 'selected': return <span className="badge badge-primary">已選用</span>;
      case 'filmed': return <span className="badge badge-success">已拍攝</span>;
      case 'published': return <span className="badge">已發布</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="view-shell">
      <header className="view-header">
        <div>
          <h1 className="view-title">腳本庫</h1>
          <p className="view-subtitle">保存產出的腳本草稿，並標記目前拍攝與發布狀態。</p>
        </div>
      </header>
      <div className="view-content">
        {scripts.length === 0 ? (
          <div className="card empty-state">
            <FileText size={48} />
            <p>目前還沒有腳本。請先到腳本工作台產生第一份草稿。</p>
          </div>
        ) : (
          <div className="library-grid">
            {scripts.map((script) => (
              <div key={script.id} className="card library-card">
                <div className="library-card-header">
                  {getStatusBadge(script.status)}
                  <select
                    className="input-field status-select"
                    value={script.status}
                    onChange={(event) => updateScriptStatus(script.id, event.target.value as any)}
                  >
                    <option value="draft">草稿</option>
                    <option value="selected">已選用</option>
                    <option value="filmed">已拍攝</option>
                    <option value="published">已發布</option>
                  </select>
                </div>

                <div className="library-meta">
                  <span>{script.platform}</span>
                  <span>{script.purpose}</span>
                  <span>{script.durationSeconds} 秒</span>
                </div>

                <div className="library-preview">
                  {script.blocks[0]?.audio}
                </div>

                <div className="library-date">
                  {new Date(script.createdAt).toLocaleString('zh-TW')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
