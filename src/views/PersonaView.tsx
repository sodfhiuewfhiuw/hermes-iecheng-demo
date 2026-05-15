import React, { useEffect, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { PersonaData } from '../api';
import { ArrowRight, Lightbulb, Save, Sparkles } from 'lucide-react';

const PLATFORM_OPTIONS = ['YouTube Shorts', 'TikTok/抖音', 'Instagram Reels', 'Facebook Reels', '多平台'];
const TONE_OPTIONS = ['自然口語', '專業可信', '生活感', '幽默吐槽', '溫柔陪伴', '犀利分析', '台灣在地感'];
const CTA_GOAL_OPTIONS = ['引導私訊', '留下資料', '預約諮詢', '索取報告', '領取範例', '加入 LINE', '前往表單', '追蹤帳號'];
const CTA_STRENGTH_OPTIONS = ['自然提醒', '明確邀請', '強烈行動', '低壓試探'];

const emptyPersona: PersonaData = {
  brandName: '',
  industry: '',
  role: '',
  audience: '',
  tones: [],
  platforms: [],
  forbiddenWords: '',
  ctaMethod: '',
  ctaGoal: '引導私訊',
  ctaKeyword: '',
  ctaStrength: '自然提醒',
  ctaNote: '',
};

export const PersonaView: React.FC = () => {
  const { persona, updatePersona, suggestCta, suggestBoundaries, setActiveView } = useAppContext();
  const [formData, setFormData] = useState<PersonaData>(persona || emptyPersona);
  const [isSaving, setIsSaving] = useState(false);
  const [ctaSuggestions, setCtaSuggestions] = useState<string[]>([]);
  const [boundarySuggestions, setBoundarySuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (persona) setFormData({ ...emptyPersona, ...persona });
  }, [persona]);

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const setField = (name: keyof PersonaData, value: string) => {
    setFormData({ ...formData, [name]: value });
  };

  const toggleArrayValue = (field: 'platforms' | 'tones', value: string) => {
    const current = formData[field];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setFormData({ ...formData, [field]: next });
  };

  const buildCtaMethod = (data: PersonaData) => {
    const parts = [
      data.ctaGoal,
      data.ctaKeyword ? `關鍵字「${data.ctaKeyword}」` : '',
      data.ctaStrength,
      data.ctaNote,
    ].filter(Boolean);
    return parts.join('，');
  };

  const applyBasicCta = () => {
    setFormData({
      ...formData,
      ctaGoal: '引導私訊',
      ctaKeyword: '短影音健檢',
      ctaStrength: '自然提醒',
      ctaNote: '不要太硬銷，不要承諾成效，先讓對方願意私訊了解。',
      ctaMethod: '想先知道你的短影音卡在哪裡，可以私訊「短影音健檢」拿初步方向。',
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    const payload = {
      ...formData,
      ctaMethod: formData.ctaMethod || buildCtaMethod(formData),
    };
    await updatePersona(payload);
    setFormData(payload);
    setIsSaving(false);
  };

  const handleSuggestCta = async () => setCtaSuggestions(await suggestCta({ ...formData, ctaMethod: buildCtaMethod(formData) }));
  const handleSuggestBoundaries = async () => setBoundarySuggestions(await suggestBoundaries(formData));

  return (
    <div className="view-shell">
      <header className="view-header flow-header">
        <div>
          <h1 className="view-title">人設設定</h1>
          <p className="view-subtitle">設定品牌定位、受眾、語氣、CTA 與內容邊界，讓 IE程 產出更像你的品牌。</p>
        </div>
        <div className="flow-pills">
          <span className="active">1 人設</span>
          <span>2 學習</span>
          <span>3 產出</span>
        </div>
      </header>

      <div className="view-content persona-layout">
        <div className="card ux-note">
          <strong>目前設定只影響此工作區</strong>
          <p>品牌名稱、產業、受眾、語氣、CTA 與禁語只會影響目前 Demo workspace，不會改動原始模型或其他客戶資料。</p>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => setActiveView('learn-url')}>
            下一步：匯入學習資料 <ArrowRight size={14} />
          </button>
        </div>

        <form className="card persona-form" onSubmit={handleSubmit}>
          <div className="form-grid two">
            <div className="form-group">
              <label className="form-label">品牌 / 專案名稱</label>
              <input name="brandName" className="input-field" value={formData.brandName} onChange={handleTextChange} required />
            </div>
            <div className="form-group">
              <label className="form-label">產業</label>
              <input name="industry" className="input-field" value={formData.industry} onChange={handleTextChange} required />
            </div>
            <div className="form-group wide">
              <label className="form-label">角色定位</label>
              <input name="role" className="input-field" value={formData.role} onChange={handleTextChange} required />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">主要平台</label>
            <div className="chip-grid">
              {PLATFORM_OPTIONS.map((platform) => (
                <button key={platform} className={`choice-chip ${formData.platforms.includes(platform) ? 'selected' : ''}`} type="button" onClick={() => toggleArrayValue('platforms', platform)}>
                  {platform}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">目標受眾</label>
            <textarea
              name="audience"
              className="input-field"
              value={formData.audience}
              onChange={handleTextChange}
              placeholder="例如：想開始做短影音但不知道怎麼拍的品牌主、個人品牌、在地店家老闆"
            />
          </div>

          <div className="form-group">
            <label className="form-label">口語語氣</label>
            <div className="chip-grid">
              {TONE_OPTIONS.map((tone) => (
                <button key={tone} className={`choice-chip ${formData.tones.includes(tone) ? 'selected' : ''}`} type="button" onClick={() => toggleArrayValue('tones', tone)}>
                  {tone}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group suggestion-block">
            <div className="field-row">
              <label className="form-label">CTA 客製設定</label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleSuggestCta}>
                <Sparkles size={13} /> AI 建議
              </button>
            </div>

            <div className="cta-guide">
              <strong>基礎教學</strong>
              <p>先決定你要觀眾做什麼，再給一個簡單關鍵字。不要一開始就硬賣，先讓對方願意私訊或留下資料。</p>
              <button className="btn btn-secondary btn-sm" type="button" onClick={applyBasicCta}>
                套用基礎 CTA 範例
              </button>
            </div>

            <div className="form-grid two">
              <div className="form-group">
                <label className="form-label subtle-label">CTA 目的</label>
                <select className="input-field" value={formData.ctaGoal} onChange={(event) => setField('ctaGoal', event.target.value)}>
                  {CTA_GOAL_OPTIONS.map((goal) => <option key={goal}>{goal}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label subtle-label">CTA 強度</label>
                <select className="input-field" value={formData.ctaStrength} onChange={(event) => setField('ctaStrength', event.target.value)}>
                  {CTA_STRENGTH_OPTIONS.map((strength) => <option key={strength}>{strength}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label subtle-label">私訊關鍵字 / 表單名稱</label>
                <input
                  name="ctaKeyword"
                  className="input-field"
                  value={formData.ctaKeyword}
                  onChange={handleTextChange}
                  placeholder="例如：短影音健檢、腳本範例、內容盤點"
                />
              </div>
              <div className="form-group">
                <label className="form-label subtle-label">補充限制</label>
                <input
                  name="ctaNote"
                  className="input-field"
                  value={formData.ctaNote}
                  onChange={handleTextChange}
                  placeholder="例如：不要太硬銷、不要承諾成效"
                />
              </div>
            </div>

            <label className="form-label subtle-label">最後使用的 CTA 文案</label>
            <input
              name="ctaMethod"
              className="input-field"
              value={formData.ctaMethod}
              onChange={handleTextChange}
              placeholder={buildCtaMethod(formData)}
            />

            {ctaSuggestions.length > 0 && (
              <div className="suggestion-list">
                {ctaSuggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setFormData({ ...formData, ctaMethod: suggestion })}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-group suggestion-block">
            <div className="field-row">
              <label className="form-label">不能講的話 / 邊界</label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleSuggestBoundaries}>
                <Lightbulb size={13} /> AI 建議
              </button>
            </div>
            <textarea name="forbiddenWords" className="input-field" value={formData.forbiddenWords} onChange={handleTextChange} />
            {boundarySuggestions.length > 0 && (
              <div className="suggestion-list">
                {boundarySuggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => setFormData({ ...formData, forbiddenWords: formData.forbiddenWords ? `${formData.forbiddenWords}\n${suggestion}` : suggestion })}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              <Save size={16} />
              {isSaving ? '儲存中...' : '儲存人設'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
