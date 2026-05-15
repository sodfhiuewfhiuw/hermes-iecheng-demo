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
    const ok = window.confirm('確定要刪除這份學習資料？刪除後，後續產文不會再引用它。');
    if (!ok) return;
    setDeletingId(id);
    await deleteLearning(id);
    setDeletingId(null);
  };

  return (
    <div className="view-shell">
      <header className="view-header flow-header">
        <div>
          <h1 className="view-title">IE程 學習室</h1>
          <p className="view-subtitle">貼上你允許 IE程 學習的文字。這裡不主動開 URL、不搜尋網路，只整理你提供的內容。</p>
        </div>
        <div className="flow-pills">
          <span>1 人設</span>
          <span className="active">2 學習</span>
          <span>3 操盤</span>
        </div>
      </header>

      <div className="view-content url-learning-layout">
        <div className="card learning-input-card">
          <div className="learning-copy">
            <h2 className="card-header"><FileText size={18} /> 匯入文字資料</h2>
            <p className="helper-text">
              可貼上品牌介紹、服務說明、活動資訊、FAQ、銷售話術、社群貼文或短影音方向。單次 Demo 建議 10,000 字內。
            </p>
            <textarea
              className="input-field"
              placeholder="貼上你要 IE程 學習的文字。若只有網址，系統不會自動開啟網頁，請貼上網頁中的實際文字內容。"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <div className="form-actions split-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setActiveView('workbench')}>
                回到腳本工作台 <ArrowRight size={16} />
              </button>
              <button className="btn btn-primary" onClick={handleLearn} disabled={isLearning || !input.trim()}>
                <Search size={16} />
                {isLearning ? '學習中...' : '開始學習文字'}
              </button>
            </div>
          </div>
          <div className="ux-note compact-note">
            <strong>學習資料邊界</strong>
            <p>資料只寫入目前 workspace 的知識層，不會污染固定 IE程 Core。你可以刪除每一份學習資料，刪除後不再參與後續生成。</p>
          </div>
        </div>

        {learnedUrls.length > 0 && (
          <div>
            <div className="section-heading-row">
              <h3 className="section-title">已學習資料</h3>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setActiveView('workbench')}>
                用這些資料產生腳本 <ArrowRight size={14} />
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
                    <button
                      className="btn btn-danger btn-sm"
                      type="button"
                      onClick={() => handleDelete(result.id)}
                      disabled={deletingId === result.id}
                    >
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
                      <div className="result-label">品牌語氣判斷</div>
                      <div>{result.audience}</div>
                    </div>
                    <div>
                      <div className="result-label">缺少資訊 / 可產出內容</div>
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
