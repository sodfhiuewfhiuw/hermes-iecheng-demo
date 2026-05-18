import React, { useEffect, useState } from 'react';
import { AlertCircle, Clock, MessageSquare, RefreshCw, Users, Wand2 } from 'lucide-react';
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
  if (style === '單人口播') return ['品牌主'];
  return ['品牌主', '藏鏡人'];
}

function formatQualityLabel(key: string) {
  const labels: Record<string, string> = {
    hook: '開場鉤子',
    interaction: '角色互動',
    cta: 'CTA 明確度',
    shootability: '可拍攝性',
    risk: '禁語與誇大風險',
  };
  return labels[key] || key;
}

export const ScriptWorkbenchView: React.FC = () => {
  const { generateScript, rewriteScript, addMemory, scripts, persona } = useAppContext();
  const [params, setParams] = useState<ScriptParams>({
    platform: '多平台',
    purpose: '建立信任',
    scriptStyle: '雙人對話',
    durationSeconds: 45,
    tones: persona?.tones?.length ? persona.tones : ['自然口語', '專業可信', '台灣在地感'],
    roles: ['品牌主', '藏鏡人'],
  });
  const [busy, setBusy] = useState(false);
  const [rewriteBusy, setRewriteBusy] = useState('');
  const [error, setError] = useState('');
  const currentScript = scripts[0];

  useEffect(() => {
    if (!persona?.tones?.length) return;
    setParams((prev) => ({
      ...prev,
      tones: Array.from(new Set([...persona.tones, ...prev.tones])),
    }));
  }, [persona?.tones]);

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
    setError('');
    try {
      await generateScript(params);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API 錯誤，請聯繫官方');
    } finally {
      setBusy(false);
    }
  };

  const handleRewrite = async (instruction: string) => {
    if (!currentScript) return;
    setRewriteBusy(instruction);
    setError('');
    try {
      await rewriteScript(currentScript.id, instruction);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API 錯誤，請聯繫官方');
    } finally {
      setRewriteBusy('');
    }
  };

  return (
    <div className="view-shell">
      <header className="view-header flow-header">
        <div>
          <h1 className="view-title">腳本工作台</h1>
          <p className="view-subtitle">
            表單式產生器會呼叫真實 HERMES LLM；API 失敗時會明確報錯，不會產生假草稿。
          </p>
        </div>
      </header>

      <div className="view-content workbench-layout">
        <aside className="card workbench-controls">
          <h2 className="card-header">產出條件</h2>

          {error && (
            <div className="inline-alert error">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

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
            <input
              className="input-field"
              value={params.roles.join('、')}
              onChange={(event) => setParams({
                ...params,
                roles: event.target.value.split(/[、,\n]/).map((item) => item.trim()).filter(Boolean),
              })}
              placeholder="例如：品牌主、藏鏡人、客戶"
            />
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
            {busy ? 'HERMES 產生中...' : '產生腳本'}
          </button>
        </aside>

        <section className="workbench-output">
          {!currentScript ? (
            <div className="card empty-state">
              <MessageSquare size={42} />
              <p>還沒有腳本草稿。先設定人設、CTA 與角色形式，再產生一版可拍攝的互動腳本。</p>
            </div>
          ) : (
            <div className="script-output-stack">
              <div className="card">
                <h2 className="card-header">{currentScript.scriptStyle} / {currentScript.purpose}</h2>
                {currentScript.hermesJudgement && <p className="compact-text">{currentScript.hermesJudgement}</p>}
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
                      <span>{formatQualityLabel(key)}</span>
                      <strong>{String(value)}</strong>
                    </div>
                  ))}
                </div>
              )}

              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={() => handleRewrite('請把台詞改得更像真人對話，減少公關稿和簡報感。')} disabled={Boolean(rewriteBusy)}>
                  {rewriteBusy.includes('真人') ? <RefreshCw size={14} className="animate-spin" /> : null}
                  更口語
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => handleRewrite('請加強角色之間的衝突、追問、反應與轉折，但不要新增未提供的硬事實。')} disabled={Boolean(rewriteBusy)}>
                  加強角色衝突
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => addMemory('後續腳本優先保留角色互動、現場感、真人口語，不要寫成制式文案。')}>
                  加入記憶
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
