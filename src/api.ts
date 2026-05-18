export interface StatusResponse {
  coreVersion: string;
  runtime: string;
  coreMutable: boolean;
  auth: string;
  workspaceId: string;
  isolationMode: string;
  sourceArtifact: string;
  aiConnected?: boolean;
  aiModel?: string;
}

export interface PersonaData {
  brandName: string;
  industry: string;
  role: string;
  audience: string;
  tones: string[];
  platforms: string[];
  forbiddenWords: string;
  ctaMethod: string;
  ctaGoal: string;
  ctaKeyword: string;
  ctaStrength: string;
  ctaNote: string;
}

export interface UrlLearningResult {
  id: string;
  background: string;
  highlights: string;
  audience: string;
  painPoints: string;
  topics: string;
  sellingPoints: string;
  sourceText?: string;
}

export interface ScriptParams {
  platform: string;
  purpose: string;
  scriptStyle: string;
  durationSeconds: number;
  tones: string[];
  roles: string[];
  usePublicResearch?: boolean;
}

export interface ScriptBlock {
  time: string;
  visual: string;
  audio: string;
  speaker?: string;
}

export interface QualityCheck {
  hook: string;
  interaction: string;
  cta: string;
  shootability: string;
  risk: string;
  humanSpeech?: string;
}

export interface PublicResearch {
  industrySnapshot?: string;
  audienceSignals?: string[];
  popularAngles?: string[];
  platformNotes?: string[];
  riskNotes?: string[];
  sources?: string[];
}

export interface VoiceDna {
  firstReactionPatterns?: string[];
  mouthLines?: string[];
  innerOs?: string[];
  rhythm?: string;
  signaturePhrases?: string[];
  forbiddenVoice?: string[];
  speechConfidence?: string;
}

export interface RehearsalLine {
  speaker: string;
  line: string;
  innerOs?: string;
  mouthLine?: string;
  purpose?: string;
}

export interface StoryBeats {
  hook?: string;
  setup?: string;
  conflict?: string;
  turningPoint?: string;
  ending?: string;
}

export interface PublishPack {
  title?: string;
  subtitleFirstLine?: string;
  cta?: string;
  hashtags?: string[];
}

export interface ScriptData {
  id: string;
  platform: string;
  purpose: string;
  scriptStyle: string;
  durationSeconds: number;
  tones: string[];
  roles: string[];
  blocks: ScriptBlock[];
  status: 'draft' | 'selected' | 'filmed' | 'published';
  createdAt: string;
  hermesJudgement?: string;
  usableMaterials?: string;
  missingInfo?: string;
  safetyCheck?: string;
  citations?: string[];
  publicResearch?: PublicResearch | null;
  voiceDna?: VoiceDna;
  rehearsalPreview?: RehearsalLine[];
  realLines?: string[];
  storyBeats?: StoryBeats;
  publishPack?: PublishPack;
  qualityCheck?: QualityCheck;
}

export interface MemoryData {
  id: string;
  content: string;
  createdAt: string;
}

interface HermesScriptResponse {
  hermesJudgement?: string;
  usableMaterials?: string;
  missingInfo?: string;
  safetyCheck?: string;
  citations?: string[];
  publicResearch?: PublicResearch | null;
  voiceDna?: VoiceDna;
  rehearsalPreview?: RehearsalLine[];
  realLines?: string[];
  storyBeats?: StoryBeats;
  publishPack?: PublishPack;
  qualityCheck?: QualityCheck;
  blocks?: ScriptBlock[];
}

const defaultPersona: PersonaData = {
  brandName: 'IE程',
  industry: '短影音行銷操盤',
  role: '短影音藏鏡人 / 腳本操盤手',
  audience: '想開始做短影音但不知道怎麼拍的品牌主、個人品牌、在地店家老闆',
  tones: ['哥們專業', '台灣口語', '藏鏡人補刀'],
  platforms: ['Instagram Reels', 'YouTube Shorts', '多平台'],
  forbiddenWords: [
    '不保證流量、成交或業績結果。',
    '不使用恐嚇式行銷，不誇大焦慮。',
    '避免 AI 公關腔：打造完整體驗、有效提升品牌價值、歡迎了解更多。',
  ].join('\n'),
  ctaMethod: '想先看你的短影音可以怎麼拍，私訊我「短影音腳本」，我先幫你抓一版方向。',
  ctaGoal: '引導私訊',
  ctaKeyword: '短影音腳本',
  ctaStrength: '自然提醒',
  ctaNote: '不要硬銷，像藏鏡人順手提醒。',
};

let currentPersona: PersonaData = { ...defaultPersona };
let learnedUrls: UrlLearningResult[] = [{
  id: 'demo_seed',
  background: 'IE程是短影音腳本與內容操盤助手，重點不是幫品牌寫漂亮文案，而是把資料整理成能拍、能演、能轉換的短影音腳本。',
  highlights: '核心方法是先模擬現場、抓真人句、建立人設與觀眾衝突，再產出可拍攝腳本與 CTA。',
  audience: '品牌主、個人品牌、在地店家老闆、想做短影音但不知道怎麼開口的人。',
  painPoints: 'source_id=demo_seed; document_title=Demo 種子資料; chunk_id=chunk_001; workspace_id=demo-workspace-room',
  topics: '品牌 / 人設 / 短影音腳本 / 藏鏡人',
  sellingPoints: '能把零散資料變成短影音腳本、人設方向、觀眾痛點、拍攝段落與 CTA。',
  sourceText: 'Demo seed',
}];
let deletedLearningCitations = new Set<string>();
let scriptsLibrary: ScriptData[] = [];
let workspaceMemories: MemoryData[] = [];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getServerStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) return null;
    return await response.json() as { aiConnected: boolean; model: string; mode: string; policy?: string };
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IE程 API 回應失敗：${text}`);
  }
  return await response.json() as T;
}

function fallbackScriptError(reason: string): HermesScriptResponse {
  return {
    hermesJudgement: 'IE程目前沒有拿到 AI 回應，先用本地 fallback 顯示錯誤狀態。',
    usableMaterials: '請檢查 local AI server、API key 或 server log。',
    missingInfo: '真實 AI 回應失敗，無法判斷缺少資訊。',
    safetyCheck: '這是本地 fallback，不會寫入 core。',
    citations: [],
    voiceDna: {
      firstReactionPatterns: [],
      mouthLines: [],
      innerOs: [],
      rhythm: 'AI 回應失敗',
      signaturePhrases: [],
      forbiddenVoice: [],
      speechConfidence: 'low',
    },
    rehearsalPreview: [{ speaker: '系統', line: reason, purpose: '錯誤訊息' }],
    realLines: [],
    storyBeats: {},
    publishPack: {},
    qualityCheck: {
      hook: '風險：AI 回應失敗。',
      interaction: '風險：沒有產生角色互動。',
      cta: '風險：沒有產生 CTA。',
      shootability: '風險：沒有產生可拍攝腳本。',
      risk: '風險：請檢查 AI server。',
      humanSpeech: '風險：未通過人味檢查。',
    },
    blocks: [{
      time: 'AI 回應失敗',
      speaker: '系統',
      visual: '請確認 AI server 是否啟動。',
      audio: reason,
    }],
  };
}

function withLearningId(result: UrlLearningResult): UrlLearningResult {
  return {
    ...result,
    id: result.id || `learn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
}

function markDeletedCitations(citations?: string[]) {
  return (citations || []).map((citation) => (
    deletedLearningCitations.has(citation) ? `${citation}（來源已刪除）` : citation
  ));
}

function localLearningFallback(input: { url?: string; text?: string }): UrlLearningResult {
  const sourceId = `source_${Date.now()}`;
  const text = input.text || input.url || '';
  return {
    id: sourceId,
    background: text ? '已把使用者提供的文字整理成 workspace 學習資料。' : '目前沒有收到可學習文字。',
    highlights: text ? '可用於品牌介紹、短影音腳本、人設設定、CTA 與 FAQ。' : '缺少可整理的重點。',
    audience: currentPersona.audience || '受眾尚未明確。',
    painPoints: `source_id=${sourceId}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo-workspace-room`,
    topics: '文字匯入 / 品牌資料 / 短影音素材',
    sellingPoints: '可轉成腳本素材、真人句、觀眾痛點、拍攝段落與 CTA。',
    sourceText: text,
  };
}

export const api = {
  getStatus: async (): Promise<StatusResponse> => {
    const aiStatus = await getServerStatus();
    return {
      coreVersion: 'IE程 Demo Core v0.4',
      runtime: aiStatus?.aiConnected ? 'real AI via local server' : 'mock fallback',
      coreMutable: false,
      auth: aiStatus?.aiConnected ? 'local API key loaded server-side' : 'API key not loaded',
      workspaceId: 'demo-workspace-room',
      isolationMode: 'TG room voice DNA + workspace learning',
      sourceArtifact: 'IE程 short-video operator prompt',
      aiConnected: aiStatus?.aiConnected ?? false,
      aiModel: aiStatus?.model,
    };
  },

  getState: async () => {
    await delay(120);
    return { workspace: 'Demo Workspace', persona: currentPersona, learnedUrls, memories: workspaceMemories, scripts: scriptsLibrary };
  },

  updatePersona: async (data: Partial<PersonaData>) => {
    await delay(120);
    currentPersona = { ...currentPersona, ...data };
    return currentPersona;
  },

  suggestCta: async (data: Partial<PersonaData>) => {
    try {
      const result = await postJson<{ suggestions: string[] }>('/api/suggest-cta', { persona: data });
      return result?.suggestions?.length ? result.suggestions : ['想先看你的短影音可以怎麼拍，私訊我「短影音腳本」。'];
    } catch {
      return [
        '想先看你的短影音可以怎麼拍，私訊我「短影音腳本」，我先幫你抓一版方向。',
        '如果你也卡在腳本和人設，直接私訊「短影音腳本」。',
      ];
    }
  },

  suggestBoundaries: async (data: Partial<PersonaData>) => {
    try {
      const result = await postJson<{ suggestions: string[] }>('/api/suggest-boundaries', { persona: data });
      return result?.suggestions?.length ? result.suggestions : ['不保證流量、成交或業績結果。', '不使用恐嚇式行銷。'];
    } catch {
      return ['不保證流量、成交或業績結果。', '不使用恐嚇式行銷。', '不把公開資訊寫成品牌承諾。'];
    }
  },

  learnUrl: async (input: { url?: string; text?: string }): Promise<UrlLearningResult> => {
    const textInput = { text: input.text || input.url || '' };
    let learned: UrlLearningResult;
    try {
      learned = await postJson<UrlLearningResult>('/api/learn-text', { persona: currentPersona, input: textInput, learnedTexts: learnedUrls });
    } catch {
      learned = localLearningFallback(input);
    }
    const learnedWithId = withLearningId(learned);
    learnedUrls = [learnedWithId, ...learnedUrls];
    return learnedWithId;
  },

  deleteLearning: async (id: string) => {
    await delay(120);
    const target = learnedUrls.find((item) => item.id === id);
    if (target?.painPoints) deletedLearningCitations.add(target.painPoints);
    learnedUrls = learnedUrls.filter((item) => item.id !== id);
    scriptsLibrary = scriptsLibrary.map((script) => ({
      ...script,
      citations: markDeletedCitations(script.citations),
    }));
    return { deleted: true, id, scripts: scriptsLibrary };
  },

  generateScript: async (params: ScriptParams) => {
    let result: HermesScriptResponse;
    try {
      result = await postJson<HermesScriptResponse>('/api/scripts', {
        persona: currentPersona,
        cta: {
          goal: currentPersona.ctaGoal,
          keyword: currentPersona.ctaKeyword,
          strength: currentPersona.ctaStrength,
          note: currentPersona.ctaNote,
          finalText: currentPersona.ctaMethod,
        },
        forbiddenWords: currentPersona.forbiddenWords,
        learnedUrls,
        memories: workspaceMemories,
        params,
      });
    } catch (error) {
      result = fallbackScriptError(error instanceof Error ? error.message : String(error));
    }

    const newScript: ScriptData = {
      id: Math.random().toString(36).slice(2, 11),
      platform: params.platform,
      purpose: params.purpose,
      scriptStyle: params.scriptStyle,
      durationSeconds: params.durationSeconds,
      tones: params.tones,
      roles: params.roles,
      status: 'draft',
      createdAt: new Date().toISOString(),
      blocks: result.blocks?.length ? result.blocks : fallbackScriptError('AI 沒有回傳 blocks').blocks || [],
      hermesJudgement: result.hermesJudgement,
      usableMaterials: result.usableMaterials,
      missingInfo: result.missingInfo,
      safetyCheck: result.safetyCheck,
      citations: markDeletedCitations(result.citations),
      publicResearch: result.publicResearch,
      voiceDna: result.voiceDna,
      rehearsalPreview: result.rehearsalPreview,
      realLines: result.realLines,
      storyBeats: result.storyBeats,
      publishPack: result.publishPack,
      qualityCheck: result.qualityCheck,
    };
    scriptsLibrary = [newScript, ...scriptsLibrary];
    return newScript;
  },

  rewriteScript: async (id: string, action: string) => {
    const script = scriptsLibrary.find((item) => item.id === id);
    if (!script) throw new Error('Script not found');

    let result: HermesScriptResponse;
    try {
      result = await postJson<HermesScriptResponse>('/api/rewrite-script', { script, action, persona: currentPersona });
    } catch (error) {
      result = fallbackScriptError(error instanceof Error ? error.message : String(error));
    }

    const rewrittenScript: ScriptData = {
      ...script,
      id: Math.random().toString(36).slice(2, 11),
      createdAt: new Date().toISOString(),
      blocks: result.blocks?.length ? result.blocks : script.blocks,
      hermesJudgement: result.hermesJudgement || script.hermesJudgement,
      voiceDna: result.voiceDna || script.voiceDna,
      rehearsalPreview: result.rehearsalPreview || script.rehearsalPreview,
      realLines: result.realLines || script.realLines,
      storyBeats: result.storyBeats || script.storyBeats,
      publishPack: result.publishPack || script.publishPack,
      qualityCheck: result.qualityCheck || script.qualityCheck,
    };
    scriptsLibrary = [rewrittenScript, ...scriptsLibrary];
    return rewrittenScript;
  },

  addMemory: async (content: string) => {
    await delay(120);
    const memory: MemoryData = { id: Math.random().toString(36).slice(2, 11), content, createdAt: new Date().toISOString() };
    workspaceMemories = [memory, ...workspaceMemories];
    return memory;
  },

  deleteMemory: async (id: string) => {
    await delay(120);
    workspaceMemories = workspaceMemories.filter((memory) => memory.id !== id);
    return { deleted: true, id };
  },

  updateScriptStatus: async (id: string, status: ScriptData['status']) => {
    await delay(120);
    const script = scriptsLibrary.find((item) => item.id === id);
    if (script) script.status = status;
    return script;
  },
};
