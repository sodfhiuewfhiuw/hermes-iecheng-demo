import React, { useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { ArrowRight, CheckCircle2, FileText, Search, Trash2 } from 'lucide-react';

export const UrlLearningView: React.FC = () => {
  const { learnUrl, deleteLearning, learnedUrls, setActiveView } = useAppContext();
  const [input, setInput] = useState('');
  const [isLearning, setIsLearning] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleLearn = async () => {
    if (!input.trim()) return;
    setIsLearning(true);
    await learnUrl({ text: input });
    setIsLearning(false);
    setInput('');
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm('確定要刪除這筆學習資料嗎？刪除後不再參與後續生成。');
    if (!ok) return;
    setDeletingId(id);
    await deleteLearning(id);
    setDeletingId(null);
  };

  return (
    <div className="view-shell">
      <header className="view-header flow-header">
        <div>
          <h1 className="view-title">文字學習</h1>
          <p className="view-subtitle">貼上品牌介紹、服務說明、FAQ、銷售話術或過去文案。第一版先做文字學習，不主動爬 URL。</p>
        </div>
        <div className="flow-pills">
          <span>1 人設</span>
          <span className="active">2 學習</span>
          <span>3 腳本</span>
        </div>
      </header>

      <div className="view-content url-learning-layout">
        <div className="card learning-input-card">
          <div className="learning-copy">
            <h2 className="card-header"><FileText size={18} /> 匯入文字資料</h2>
            <p className="helper-text">
              這些資料只會進入目前 workspace。之後產生腳本時，HERMES 會用它們當品牌事實來源，不會把已刪除資料帶進新腳本。
            </p>
            <textarea
              className="input-field"
              placeholder="貼上你要 HERMES 學習的文字：品牌介紹、服務說明、FAQ、銷售話術、社群貼文、短影音逐字稿..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <div className="form-actions split-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setActiveView('workbench')}>
                去腳本工作台 <ArrowRight size={16} />
              </button>
              <button className="btn btn-primary" onClick={handleLearn} disabled={isLearning || !input.trim()}>
                <Search size={16} />
                {isLearning ? '學習中...' : '開始學習文字'}
              </button>
            </div>
          </div>
          <div className="ux-note compact-note">
            <strong>學習資料可以刪除</strong>
            <p>刪除後，新腳本不再引用該資料。舊腳本若曾引用，會顯示來源已刪除，避免看起來仍可追溯。</p>
          </div>
        </div>

        {learnedUrls.length > 0 && (
          <div>
            <div className="section-heading-row">
              <h3 className="section-title">已學習資料</h3>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setActiveView('workbench')}>
                用這些資料生成腳本 <ArrowRight size={14} />
              </button>
            </div>
            <div className="result-list">
              {learnedUrls.map((result, index) => (
                <div key={result.id} className="card result-card">
                  <div className="result-card-top">
                    <div>
                      <div className="section-label">資料 #{learnedUrls.length - index}</div>
                      <strong>{result.topics || '文字匯入資料'}</strong>
                    </div>
                    <button className="btn btn-danger btn-sm" type="button" onClick={() => handleDelete(result.id)} disabled={deletingId === result.id}>
                      <Trash2 size={14} />
                      {deletingId === result.id ? '刪除中' : '刪除'}
                    </button>
                  </div>

                  <div className="result-grid">
                    <div>
                      <div className="result-label">已學習摘要</div>
                      <div>{result.background}</div>
                    </div>
                    <div>
                      <div className="result-label">可用文稿素材</div>
                      <div>{result.highlights}</div>
                    </div>
                    <div>
                      <div className="result-label">受眾判斷</div>
                      <div>{result.audience}</div>
                    </div>
                    <div>
                      <div className="result-label">可用賣點 / 方向</div>
                      <div>
                        <CheckCircle2 size={14} color="var(--success)" className="inline-icon" />
                        {result.sellingPoints}
                      </div>
                    </div>
                    <div className="result-wide">
                      <div className="result-label">引用來源</div>
                      <div>{result.painPoints}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
