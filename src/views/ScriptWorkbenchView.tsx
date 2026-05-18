import React, { useState } from 'react';
import { Clock, MessageSquare, RefreshCw, Users, Wand2 } from 'lucide-react';
import { ScriptParams } from '../api';
import { useAppContext } from '../store/AppContext';

const PLATFORM_OPTIONS = ['Reels', 'TikTok/抖音', 'YouTube Shorts', 'Facebook Reels', '多平台'];
const PURPOSE_OPTIONS = ['曝光', '建立信任', '教育教學', '破除誤解', '引導私訊', '成交轉換', '活動宣傳', '品牌記憶點'];
const STYLE_OPTIONS = ['單人口播', '雙人對話', '三人討論', '店員客人互動', '街訪問答', '藏鏡人拆解'];
const TONE_OPTIONS = ['自然口語', '專業可信', '生活感', '幽默吐槽', '溫柔陪伴', '犀利分析', '台灣在地感', '更有鉤子', '更強 CTA'];

function defaultRoles(style: string) {
  if (style === '三人討論') return ['主持人', '客戶', '藏鏡人'];
  if (style === '店員客人互動') return ['店員', '客人', '旁白'];
  if (style === '街訪問答') return ['訪問者', '路人', '旁白'];
  if (style === '單人口播') return ['藏鏡人'];
  return ['品牌主', '藏鏡人'];
}

export const ScriptWorkbenchView: React.FC = () => {
  const { generateScript, rewriteScript, addMemory, scripts, persona, setActiveView } = useAppContext();
  const [params, setParams] = useState<ScriptParams>({
    platform: '多平台',
    purpose: '建立信任',
    scriptStyle: '雙人對話',
    durationSeconds: 45,
    tones: persona?.tones?.length ? persona.tones : ['自然口語', '台灣在地感'],
    roles: ['品牌主', '藏鏡人'],
  });
  const [busy, setBusy] = useState(false);
  const currentScript = scripts[0];

  const toggleTone = (tone: string) => {
    setParams((prev) => ({
      ...prev,
      tones: prev.tones.includes(tone) ? prev.tones.filter((item) => item !== tone) : [...prev.tones, tone],
    }));
  };

  const updateStyle = (scriptStyle: string) => {
    setParams((prev) => ({ ...prev, scriptStyle, roles: defaultRoles(scriptStyle) }));
  };

  const handleGenerate = async () => {
    setBusy(true);
    try {
      await generateScript(params);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view-shell">
      <header className="view-header flow-header">
        <div>
          <h1 className="view-title">腳本工作台</h1>
          <p className="view-subtitle">保留表單式 fallback。正式小房間請使用「HERMES 小房間」入口，讓腳本讀取 room_state。</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => setActiveView('room')}>
          <MessageSquare size={16} /> 前往小房間
        </button>
      </header>

      <div className="view-content workbench-layout">
        <aside className="card workbench-controls">
          <h2 className="card-header">產出條件</h2>

          <div className="form-group">
            <label className="form-label">平台</label>
            <select className="input-field" value={params.platform} onChange={(event) => setParams({ ...params, platform: event.target.value })}>
              {PLATFORM_OPTIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">影片目的</label>
            <select className="input-field" value={params.purpose} onChange={(event) => setParams({ ...params, purpose: event.target.value })}>
              {PURPOSE_OPTIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label"><Users size={14} /> 腳本形式</label>
            <select className="input-field" value={params.scriptStyle} onChange={(event) => updateStyle(event.target.value)}>
              {STYLE_OPTIONS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">角色設定</label>
            <input className="input-field" value={params.roles.join('、')} onChange={(event) => setParams({ ...params, roles: event.target.value.split(/[、,\n]/).map((item) => item.trim()).filter(Boolean) })} />
          </div>

          <div className="form-group">
            <label className="form-label"><Clock size={14} /> 影片長度：{params.durationSeconds} 秒</label>
            <input type="range" min="10" max="90" step="5" value={params.durationSeconds} onChange={(event) => setParams({ ...params, durationSeconds: Number(event.target.value) })} />
          </div>

          <div className="form-group">
            <label className="form-label">口吻</label>
            <div className="chip-grid compact">
              {TONE_OPTIONS.map((tone) => (
                <button key={tone} type="button" className={`choice-chip ${params.tones.includes(tone) ? 'selected' : ''}`} onClick={() => toggleTone(tone)}>
                  {tone}
                </button>
              ))}
            </div>
          </div>

          <button className="btn btn-primary full-width" type="button" onClick={handleGenerate} disabled={busy}>
            {busy ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {busy ? 'HERMES 產出中...' : '產出 Demo 腳本'}
          </button>
        </aside>

        <section className="workbench-output">
          {!currentScript ? (
            <div className="card empty-state">
              <MessageSquare size={42} />
              <p>尚未產出腳本。建議先到 HERMES 小房間貼素材，讓它先建立 voice_dna 與真人句。</p>
            </div>
          ) : (
            <div className="script-output-stack">
              <div className="card">
                <h2 className="card-header">{currentScript.scriptStyle} · {currentScript.purpose}</h2>
                <p className="compact-text">{currentScript.hermesJudgement}</p>
                {(currentScript.blocks || []).map((block) => (
                  <div className="script-block" key={`${block.time}-${block.audio}`}>
                    <div className="script-time">{block.time}</div>
                    <div>
                      <strong>{block.speaker || '旁白'}</strong>
                      <p>{block.visual}</p>
                      <p>{block.audio}</p>
                    </div>
                  </div>
                ))}
              </div>

              {currentScript.qualityCheck && (
                <div className="card">
                  <h2 className="card-header">品質檢查</h2>
                  {Object.entries(currentScript.qualityCheck).map(([key, value]) => (
                    <div className="metric-row" key={key}>
                      <span>{key}</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))}
                </div>
              )}

              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={() => rewriteScript(currentScript.id, '更口語')}>更口語</button>
                <button className="btn btn-secondary" type="button" onClick={() => rewriteScript(currentScript.id, '加強角色衝突')}>加強角色衝突</button>
                <button className="btn btn-secondary" type="button" onClick={() => addMemory('使用者偏好多人互動腳本，不要只有單人口播。')}>加入記憶</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
