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
  qualityCheck?: QualityCheck;
  blocks?: ScriptBlock[];
}

const defaultPersona: PersonaData = {
  brandName: 'IE獅夢遊行銷',
  industry: '短影音策略與內容操盤',
  role: '短影音藏鏡人',
  audience: '',
  tones: ['自然口語', '專業可信', '台灣在地感'],
  platforms: ['Instagram Reels', 'YouTube Shorts'],
  forbiddenWords: [
    '不保證流量、成交或業績結果',
    '不使用恐嚇式行銷',
    '不編造案例、價格或成效數字',
  ].join('\n'),
  ctaMethod: '想知道你的短影音卡在哪裡，私訊「短影音健檢」，IE程先幫你抓出一個最該修的問題。',
  ctaGoal: '引導私訊',
  ctaKeyword: '短影音健檢',
  ctaStrength: '自然但明確',
  ctaNote: '不要過度銷售，要像藏鏡人在旁邊提醒對方下一步。',
};

let currentPersona: PersonaData = { ...defaultPersona };
let learnedUrls: UrlLearningResult[] = [{
  id: 'demo_seed',
  background: 'Demo 初始知識：IE程是短影音腳本與文字學習工作區，會先讀使用者提供的資料，再整理成可拍、可改、可追溯的文稿素材。',
  highlights: '可用素材包含品牌定位、服務說明、受眾痛點、常見誤解、CTA、FAQ、社群貼文與短影音腳本方向。',
  audience: '目前語氣以自然口語、專業可信、台灣在地感為基礎；若文本不足，IE程不會自行編造完整品牌語氣。',
  painPoints: 'source_id=demo_seed; document_title=Demo 初始知識; chunk_id=chunk_001; workspace_id=demo-workspace-room',
  topics: '品牌 / 服務 / 話術 / 短影音腳本素材',
  sellingPoints: '可協助把已提供的企業知識整理成腳本、社群貼文、FAQ、私訊引導與內容企劃；不主動爬 URL。',
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
    return await response.json() as { aiConnected: boolean; model: string; mode: string };
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
    throw new Error(`IE程 API 呼叫失敗：${text}`);
  }
  return await response.json() as T;
}

function fallbackScriptError(reason: string): HermesScriptResponse {
  return {
    hermesJudgement: 'IE程這次沒有成功拿到 AI 輸出，所以改用安全 fallback 呈現。',
    usableMaterials: '請確認 AI server、API key 與 server log；目前沒有新增未提供的事實。',
    missingInfo: '缺少穩定的 AI 回應，請稍後重試。',
    safetyCheck: '已進入 fallback，沒有使用外部資料，也沒有寫入 core。',
    citations: [],
    qualityCheck: {
      hook: '風險：這是 fallback，不代表完整腳本品質。',
      interaction: '風險：沒有取得 AI 角色互動判斷。',
      cta: '風險：沒有取得 AI CTA 判斷。',
      shootability: '風險：沒有取得 AI 拍攝檢查。',
      risk: '風險：AI 呼叫失敗。',
    },
    blocks: [{
      time: 'AI 呼叫失敗',
      speaker: '系統',
      visual: '請檢查 AI server 是否正常執行。',
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
    background: text
      ? '已把使用者提供的文字整理成 workspace 學習資料，可供後續腳本與文案使用。'
      : '尚未提供可學習的文字內容。',
    highlights: text
      ? '可用素材包含品牌定位、服務說明、觀眾痛點、內容主題與 CTA 線索。'
      : '目前沒有足夠資料可整理成素材。',
    audience: currentPersona.tones.length
      ? `目前語氣可依人設設定：${currentPersona.tones.join('、')}。`
      : '目前文本不足以判斷完整品牌語氣。',
    painPoints: `source_id=${sourceId}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo-workspace-room`,
    topics: '文字匯入 / 品牌資料 / 短影音素材',
    sellingPoints: '可產出短影音腳本、社群貼文、FAQ、銷售話術與 CTA；若要更準，請補案例、價格、限制與常見問題。',
    sourceText: text,
  };
}

export const api = {
  getStatus: async (): Promise<StatusResponse> => {
    const aiStatus = await getServerStatus();
    return {
      coreVersion: 'IE程 Demo Core v0.2',
      runtime: aiStatus?.aiConnected ? 'real AI via local server' : 'mock fallback',
      coreMutable: false,
      auth: aiStatus?.aiConnected ? 'local API key loaded server-side' : 'API key not loaded',
      workspaceId: 'demo-workspace-room',
      isolationMode: 'workspace text learning',
      sourceArtifact: 'IE程 short-video script operator prompt',
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
      return result?.suggestions?.length ? result.suggestions : [
        '想知道你的短影音卡在哪裡，私訊「短影音健檢」，IE程先幫你抓出一個最該修的問題。',
      ];
    } catch {
      return [
        '想知道你的短影音卡在哪裡，私訊「短影音健檢」，IE程先幫你抓出一個最該修的問題。',
        '如果你也不想再亂拍，先私訊「短影音健檢」，把人設和內容方向拆清楚。',
      ];
    }
  },

  suggestBoundaries: async (data: Partial<PersonaData>) => {
    try {
      const result = await postJson<{ suggestions: string[] }>('/api/suggest-boundaries', { persona: data });
      return result?.suggestions?.length ? result.suggestions : [
        '不保證流量、成交或業績結果。',
        '不編造案例、價格或數據。',
      ];
    } catch {
      return [
        '不保證流量、成交或業績結果。',
        '不使用恐嚇式行銷或過度焦慮語氣。',
        '沒有案例、數據或價格時，不自行編造。',
      ];
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
