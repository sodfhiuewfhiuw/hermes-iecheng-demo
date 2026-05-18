import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { ScriptParams, StoryBeats } from '../api';
import { BrainCircuit, CheckCircle2, Clock, FileText, Globe2, MessageSquare, RefreshCw, ShieldCheck, Target, Users, Volume2, Wand2 } from 'lucide-react';

const PLATFORM_OPTIONS = ['Reels', 'TikTok/抖音', 'YouTube Shorts', 'Facebook Reels', '多平台'];
const PURPOSE_OPTIONS = ['曝光', '建立信任', '教育教學', '破除誤解', '引導私訊', '成交轉換', '活動宣傳', '品牌記憶點'];
const SCRIPT_STYLE_OPTIONS = ['單人口播', '雙人對話', '三人討論', '店員客人互動', '街訪問答', '情境短劇', '一人分飾兩角', '老闆藏鏡人拆解'];
const TONE_OPTIONS = ['自然口語', '專業可信', '生活感', '幽默吐槽', '溫柔陪伴', '犀利分析', '台灣在地感', '更強 CTA'];
const REWRITE_ACTIONS = ['重跑模擬現場', '增加互動衝突', '更口語一點', '更像短影音', '加強開場鉤子', '加強 CTA'];

function defaultRolesForStyle(style: string) {
  switch (style) {
    case '單人口播':
      return ['旁白'];
    case '三人討論':
      return ['主持人', '客戶', '藏鏡人'];
    case '店員客人互動':
      return ['店員', '客人', '旁白'];
    case '街訪問答':
      return ['訪問者', '路人', '旁白'];
    case '一人分飾兩角':
      return ['理性版', '焦慮版'];
    case '情境短劇':
      return ['品牌主', '觀眾', '藏鏡人'];
    case '老闆藏鏡人拆解':
      return ['老闆', '藏鏡人', '旁白'];
    case '雙人對話':
    default:
      return ['品牌主', '藏鏡人'];
  }
}

function qualityEntries(check?: any) {
  if (!check) return [];
  return [
    ['開場鉤子', check.hook],
    ['角色互動 / 衝突', check.interaction],
    ['CTA 是否明確', check.cta],
    ['是否可拍攝', check.shootability],
    ['禁語與誇大風險', check.risk],
  ];
}

function beatEntries(beats?: StoryBeats) {
  if (!beats) return [];
  return [
    ['Hook', beats.hook],
    ['推進', beats.setup],
    ['衝突', beats.conflict],
    ['轉折', beats.turningPoint],
    ['收尾', beats.ending],
  ].filter(([, value]) => Boolean(value));
}

export const ScriptWorkbenchView: React.FC = () => {
  const { generateScript, rewriteScript, addMemory, scripts, persona, learnedUrls, setActiveView } = useAppContext();
  const [params, setParams] = useState<ScriptParams>({
    platform: 'Reels',
    purpose: '建立信任',
    scriptStyle: '雙人對話',
    durationSeconds: 30,
    tones: persona?.tones?.length ? persona.tones : ['自然口語'],
    roles: defaultRolesForStyle('雙人對話'),
    usePublicResearch: false,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [rewritingId, setRewritingId] = useState<string | null>(null);

  const currentScript = scripts[0];
  const roleText = params.roles.join('、');
  const qualityList = useMemo(() => qualityEntries(currentScript?.qualityCheck), [currentScript?.qualityCheck]);
  const storyBeatList = useMemo(() => beatEntries(currentScript?.storyBeats), [currentScript?.storyBeats]);

  useEffect(() => {
    if (persona?.tones?.length) {
      setParams((prev) => ({ ...prev, tones: Array.from(new Set([...persona.tones, ...prev.tones])) }));
    }
  }, [persona?.tones]);

  const toggleTone = (tone: string) => {
    setParams((prev) => ({
      ...prev,
      tones: prev.tones.includes(tone) ? prev.tones.filter((item) => item !== tone) : [...prev.tones, tone],
    }));
  };

  const updateScriptStyle = (scriptStyle: string) => {
    setParams((prev) => ({ ...prev, scriptStyle, roles: defaultRolesForStyle(scriptStyle) }));
  };

  const updateRoles = (value: string) => {
    const roles = value.split(/[、,\n]/).map((item) => item.trim()).filter(Boolean);
    setParams((prev) => ({ ...prev, roles }));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generateScript(params);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRewrite = async (action: string) => {
    if (!currentScript) return;
    setRewritingId(action);
    try {
      await rewriteScript(currentScript.id, action);
    } finally {
      setRewritingId(null);
    }
  };

  const handleAddMemory = async () => {
    if (!currentScript) return;
    const memory = window.prompt('要把哪一段重點加入目前 workspace 記憶？');
    if (memory) {
      await addMemory(memory);
      window.alert('已加入 workspace 記憶。');
    }
  };

  return (
    <div className="view-shell">
      <header className="view-header flow-header">
        <div>
          <h1 className="view-title">IE程 產出工作台</h1>
          <p className="view-subtitle">已接入原始 HERMES「先模擬再成稿」流程：先逼真人句，再剪成故事骨架，最後才出拍攝腳本。</p>
        </div>
        <div className="flow-pills">
          <span>1 人設</span>
          <span>2 學習</span>
          <span className="active">3 模擬成稿</span>
        </div>
      </header>

      <div className="view-content workbench-layout">
        <aside className="card workbench-controls">
          <h2 className="card-header">產出條件</h2>

          <div className="form-group">
            <label className="form-label"><FileText size={14} /> 平台</label>
            <select className="input-field" value={params.platform} onChange={(event) => setParams({ ...params, platform: event.target.value })}>
              {PLATFORM_OPTIONS.map((platform) => <option key={platform}>{platform}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label"><Target size={14} /> 影片目的</label>
            <select className="input-field" value={params.purpose} onChange={(event) => setParams({ ...params, purpose: event.target.value })}>
              {PURPOSE_OPTIONS.map((purpose) => <option key={purpose}>{purpose}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label"><Users size={14} /> 腳本形式</label>
            <select className="input-field" value={params.scriptStyle} onChange={(event) => updateScriptStyle(event.target.value)}>
              {SCRIPT_STYLE_OPTIONS.map((style) => <option key={style}>{style}</option>)}
            </select>
            <p className="field-hint">多人腳本會先模擬現場，再剪對話，不會直接變成資訊口播。</p>
          </div>

          <div className="form-group">
            <label className="form-label"><Users size={14} /> 角色設定</label>
            <input className="input-field" value={roleText} onChange={(event) => updateRoles(event.target.value)} />
            <p className="field-hint">可用頓號或逗號分隔，例如：品牌主、藏鏡人、客戶。</p>
          </div>

          <div className="form-group">
            <label className="form-label"><Clock size={14} /> 影片長度 / 秒</label>
            <div className="range-field">
              <input type="range" min="10" max="90" step="5" value={params.durationSeconds} onChange={(event) => setParams({ ...params, durationSeconds: Number(event.target.value) })} />
              <strong>{params.durationSeconds}</strong>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label"><Volume2 size={14} /> 口吻</label>
            <div className="chip-grid compact">
              {TONE_OPTIONS.map((tone) => (
                <button key={tone} type="button" className={`choice-chip ${params.tones.includes(tone) ? 'selected' : ''}`} onClick={() => toggleTone(tone)}>
                  {tone}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label"><Globe2 size={14} /> 公開資訊輔助</label>
            <button
              className={`choice-chip ${params.usePublicResearch ? 'selected' : ''}`}
              type="button"
              onClick={() => setParams((prev) => ({ ...prev, usePublicResearch: !prev.usePublicResearch }))}
            >
              {params.usePublicResearch ? '已啟用公開產業查詢' : '不查公開資訊'}
            </button>
            <p className="field-hint">開啟後只補市場現況、受眾訊號與熱門內容角度；品牌事實仍以 workspace 資料為主。</p>
          </div>

          <button className="btn btn-primary full-width" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {isGenerating ? 'IE程 模擬中...' : '讓 IE程 先模擬再成稿'}
          </button>
        </aside>

        <section className="workbench-output">
          {!currentScript ? (
            <div className="card empty-state">
              <div className="preflight-grid">
                <div className="preflight-item complete">人設：{persona?.brandName}</div>
                <div className={`preflight-item ${learnedUrls.length > 0 ? 'complete' : ''}`}>Workspace 學習：{learnedUrls.length} 份</div>
                <div className="preflight-item complete">角色：{roleText}</div>
              </div>
              <MessageSquare size={40} />
              <p>按下產出後，IE程 會先模擬現場對話，抓真人句，再剪成短影音腳本。</p>
              {learnedUrls.length <= 1 && (
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setActiveView('learn-url')}>
                  先去 IE程 學習室
                </button>
              )}
            </div>
          ) : (
            <div className="script-output-stack">
              <div className="hermes-brief-grid">
                <div className="card hermes-brief-card primary">
                  <div className="section-label"><BrainCircuit size={14} /> IE程 判斷</div>
                  <p>{currentScript.hermesJudgement || 'IE程 已完成本次資料判斷。'}</p>
                </div>
                <div className="card hermes-brief-card">
                  <div className="section-label">可用素材</div>
                  <p>{currentScript.usableMaterials || '已從 workspace 學習資料整理可用素材。'}</p>
                </div>
                <div className="card hermes-brief-card">
                  <div className="section-label">缺少資料</div>
                  <p>{currentScript.missingInfo || '目前沒有明顯缺口。'}</p>
                </div>
                <div className="card hermes-brief-card">
                  <div className="section-label"><ShieldCheck size={14} /> 安全檢查</div>
                  <p>{currentScript.safetyCheck || '未加入未提供的成效保證。'}</p>
                </div>
              </div>

              {currentScript.rehearsalPreview && currentScript.rehearsalPreview.length > 0 && (
                <div className="card script-card">
                  <div className="section-label">1 模擬現場</div>
                  <div className="script-block-list">
                    {currentScript.rehearsalPreview.map((line, index) => (
                      <div className="script-block" key={`${line.speaker}-${index}`}>
                        <div className="script-row"><strong>{line.speaker}</strong><span>{line.line}</span></div>
                        {line.purpose ? <div className="script-row"><strong>目的</strong><span>{line.purpose}</span></div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentScript.realLines && currentScript.realLines.length > 0 && (
                <div className="card quality-card">
                  <div className="section-label">2 真人句</div>
                  <div className="chip-row">
                    {currentScript.realLines.map((line) => <span className="badge" key={line}>{line}</span>)}
                  </div>
                </div>
              )}

              {storyBeatList.length > 0 && (
                <div className="card quality-card">
                  <div className="section-label">3 故事骨架</div>
                  <div className="quality-grid">
                    {storyBeatList.map(([label, value]) => (
                      <div className="quality-item" key={label}>
                        <strong>{label}</strong>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentScript.publicResearch && (
                <div className="card quality-card">
                  <div className="section-label"><Globe2 size={14} /> 公開資訊輔助</div>
                  <p>{currentScript.publicResearch.industrySnapshot || '已查詢公開產業資訊。'}</p>
                  <div className="chip-row">
                    {(currentScript.publicResearch.audienceSignals || []).slice(0, 4).map((item) => <span className="badge" key={item}>{item}</span>)}
                    {(currentScript.publicResearch.popularAngles || []).slice(0, 4).map((item) => <span className="badge" key={item}>{item}</span>)}
                  </div>
                </div>
              )}

              {qualityList.length > 0 && (
                <div className="card quality-card">
                  <div className="section-label"><CheckCircle2 size={14} /> 腳本品質檢查</div>
                  <div className="quality-grid">
                    {qualityList.map(([label, value]) => (
                      <div className="quality-item" key={label}>
                        <strong>{label}</strong>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card script-card">
                <div className="script-card-header">
                  <div>
                    <h2 className="card-header">4 完整拍攝版</h2>
                    <div className="chip-row">
                      <span className="badge">{currentScript.platform}</span>
                      <span className="badge">{currentScript.purpose}</span>
                      <span className="badge">{currentScript.scriptStyle}</span>
                      <span className="badge">{currentScript.roles.join('、')}</span>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={handleAddMemory}>
                    <BrainCircuit size={14} /> 加入記憶
                  </button>
                </div>

                <div className="script-block-list">
                  {currentScript.blocks.map((block, index) => (
                    <div key={index} className="script-block">
                      <div className="script-time">{block.time}</div>
                      {block.speaker ? <div className="script-row"><strong>角色</strong><span>{block.speaker}</span></div> : null}
                      <div className="script-row"><strong>畫面</strong><span>{block.visual}</span></div>
                      <div className="script-row"><strong>台詞</strong><span>{block.audio}</span></div>
                    </div>
                  ))}
                </div>

                {currentScript.publishPack && (
                  <div className="citation-box">
                    <div className="section-label">5 上片版</div>
                    {currentScript.publishPack.title ? <p>標題：{currentScript.publishPack.title}</p> : null}
                    {currentScript.publishPack.subtitleFirstLine ? <p>字幕第一句：{currentScript.publishPack.subtitleFirstLine}</p> : null}
                    {currentScript.publishPack.cta ? <p>CTA：{currentScript.publishPack.cta}</p> : null}
                    {currentScript.publishPack.hashtags?.length ? <p>{currentScript.publishPack.hashtags.join(' ')}</p> : null}
                  </div>
                )}

                {currentScript.citations && currentScript.citations.length > 0 && (
                  <div className="citation-box">
                    <div className="section-label">引用來源</div>
                    {currentScript.citations.map((citation) => <p key={citation}>{citation}</p>)}
                  </div>
                )}

                <div className="rewrite-panel">
                  <div className="section-label">改寫方向</div>
                  <div className="chip-row">
                    {REWRITE_ACTIONS.map((action) => (
                      <button key={action} className="btn btn-secondary btn-sm" onClick={() => handleRewrite(action)} disabled={!!rewritingId}>
                        {rewritingId === action ? <RefreshCw size={12} className="animate-spin" /> : null}
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
