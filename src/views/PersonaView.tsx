import React, { useEffect, useState } from 'react';
import { ArrowRight, Lightbulb, Loader2, Save, Sparkles } from 'lucide-react';
import { PersonaData } from '../api';
import { useAppContext } from '../store/AppContext';

const PLATFORM_OPTIONS = ['YouTube Shorts', 'TikTok/抖音', 'Instagram Reels', 'Facebook Reels', '多平台'];
const TONE_OPTIONS = ['自然口語', '專業可信', '生活感', '幽默吐槽', '溫柔陪伴', '犀利分析', '台灣在地感'];
const CTA_GOAL_OPTIONS = ['引導私訊', '索取資料', '預約諮詢', '留下表單', '加入 LINE', '導向連結', '索取腳本'];
const CTA_STRENGTH_OPTIONS = ['自然提醒', '明確指令', '強 CTA', '保守收尾'];

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
  const [ctaLoading, setCtaLoading] = useState(false);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [error, setError] = useState('');

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
    const keyword = data.ctaKeyword ? `關鍵字「${data.ctaKeyword}」` : '';
    return [data.ctaGoal, keyword, data.ctaStrength, data.ctaNote].filter(Boolean).join(' / ');
  };

  const applyBasicCta = () => {
    setFormData({
      ...formData,
      ctaGoal: '引導私訊',
      ctaKeyword: '短影音腳本',
      ctaStrength: '自然提醒',
      ctaNote: '不要硬銷，要像順手提醒下一步。',
      ctaMethod: '想先看你的素材可以怎麼變成可拍的短影音腳本，私訊我「短影音腳本」，IE程先幫你抓一版方向。',
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      const payload = {
        ...formData,
        ctaMethod: formData.ctaMethod || buildCtaMethod(formData),
      };
      await updatePersona(payload);
      setFormData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSuggestCta = async () => {
    setCtaLoading(true);
    setError('');
    try {
      setCtaSuggestions(await suggestCta({ ...formData, ctaMethod: buildCtaMethod(formData) }));
    } catch (err) {
      setCtaSuggestions([]);
      setError(err instanceof Error ? err.message : 'API 錯誤，請聯繫官方');
    } finally {
      setCtaLoading(false);
    }
  };

  const handleSuggestBoundaries = async () => {
    setBoundaryLoading(true);
    setError('');
    try {
      setBoundarySuggestions(await suggestBoundaries(formData));
    } catch (err) {
      setBoundarySuggestions([]);
      setError(err instanceof Error ? err.message : 'API 錯誤，請聯繫官方');
    } finally {
      setBoundaryLoading(false);
    }
  };

  return (
    <div className="view-shell">
      <header className="view-header flow-header">
        <div>
          <h1 className="view-title">人設設定</h1>
          <p className="view-subtitle">先把品牌、受眾、語氣、平台和 CTA 邊界設清楚，IE程 才能用對的角色與口吻寫腳本。</p>
        </div>
        <div className="flow-pills">
          <span className="active">1 人設</span>
          <span>2 學習</span>
          <span>3 腳本</span>
        </div>
      </header>

      <div className="view-content persona-layout">
        <div className="card ux-note">
          <strong>人設不是固定模板</strong>
          <p>這裡會影響 HERMES 的 voice_dna、角色互動與 CTA 收尾。AI 建議會真的送到模型判斷，失敗時會直接顯示錯誤。</p>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => setActiveView('learn-url')}>
            前往文字資料學習 <ArrowRight size={14} />
          </button>
        </div>

        <form className="card persona-form" onSubmit={handleSubmit}>
          {error && <div className="error-banner">{error}</div>}

          <div className="form-grid two">
            <div className="form-group">
              <label className="form-label">品牌 / 產品名稱</label>
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
              <label className="form-label">CTA 設定</label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleSuggestCta} disabled={ctaLoading}>
                {ctaLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                AI 建議
              </button>
            </div>

            <div className="cta-guide">
              <div>
                <strong>基礎 CTA</strong>
                <p>先用自然提醒，不保證成效、不硬銷，讓使用者知道下一步可以私訊或索取腳本方向。</p>
              </div>
              <button className="btn btn-secondary btn-sm" type="button" onClick={applyBasicCta}>
                套用基礎 CTA
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
                <label className="form-label subtle-label">私訊關鍵字</label>
                <input name="ctaKeyword" className="input-field" value={formData.ctaKeyword} onChange={handleTextChange} placeholder="例如：短影音腳本、品牌健檢" />
              </div>
              <div className="form-group">
                <label className="form-label subtle-label">語氣備註</label>
                <input name="ctaNote" className="input-field" value={formData.ctaNote} onChange={handleTextChange} placeholder="例如：不要硬銷，要像順手提醒" />
              </div>
            </div>

            <label className="form-label subtle-label">最終 CTA 文案</label>
            <input name="ctaMethod" className="input-field" value={formData.ctaMethod} onChange={handleTextChange} placeholder={buildCtaMethod(formData)} />

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
              <label className="form-label">不能講的話 / 內容邊界</label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleSuggestBoundaries} disabled={boundaryLoading}>
                {boundaryLoading ? <Loader2 size={13} className="animate-spin" /> : <Lightbulb size={13} />}
                AI 建議
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
