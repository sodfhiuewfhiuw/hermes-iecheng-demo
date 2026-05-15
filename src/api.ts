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
  brandName: 'IE獅夢遊仙境',
  industry: '短影音策略與腳本服務',
  role: '短影音藏鏡人',
  audience: '',
  tones: ['自然口語', '專業可信'],
  platforms: ['Instagram Reels', 'YouTube Shorts'],
  forbiddenWords: '不誇大保證成效\n不恐嚇式行銷\n不碰醫療、投資、保證收益類承諾',
  ctaMethod: '想先知道你的短影音卡在哪裡，可以私訊「短影音健檢」拿初步方向。',
  ctaGoal: '引導私訊',
  ctaKeyword: '短影音健檢',
  ctaStrength: '自然提醒',
  ctaNote: '不要太硬銷，讓對方覺得可以先詢問。',
};

let currentPersona: PersonaData = { ...defaultPersona };
let learnedUrls: UrlLearningResult[] = [{
  id: 'demo_seed',
  background: 'Demo 初始知識：IE程是文字學習與文稿產出助手，重點是吃進使用者提供的文字，整理成可用知識與文稿素材。',
  highlights: '可用素材包含品牌介紹、服務說明、FAQ、銷售話術、社群貼文、EDM 與短影音腳本方向。',
  audience: '目前語氣可依人設設定調整；若文本不足，IE程不會自行編造品牌語氣。',
  painPoints: 'source_id=demo_seed; document_title=Demo 初始知識; chunk_id=chunk_001; workspace_id=demo-workspace-room',
  topics: '品牌 / 服務 / 文稿素材 / 短影音',
  sellingPoints: '可協助把已提供資料整理成社群貼文、EDM、短影音腳本、FAQ 與銷售話術；不主動查 URL。',
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
    hermesJudgement: 'IE程沒有成功完成本次產出。',
    usableMaterials: '本次沒有產出可用素材，請確認 AI server、API key 或 server log。',
    missingInfo: '缺少可用的模型回應。',
    safetyCheck: '已阻止靜默 fallback，避免把無效內容當成正式輸出。',
    citations: [],
    qualityCheck: {
      hook: '風險：未產出開場鉤子',
      interaction: '風險：未產出角色互動',
      cta: '風險：未產出 CTA',
      shootability: '風險：未產出可拍攝腳本',
      risk: '風險：AI 呼叫失敗',
    },
    blocks: [{
      time: 'AI 呼叫失敗',
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

export const api = {
  getStatus: async (): Promise<StatusResponse> => {
    const aiStatus = await getServerStatus();
    return {
      coreVersion: 'IE程 Text-Learning Core v0.1',
      runtime: aiStatus?.aiConnected ? 'real AI via local server' : 'mock fallback',
      coreMutable: false,
      auth: aiStatus?.aiConnected ? 'local API key loaded server-side' : 'API key not loaded',
      workspaceId: 'demo-workspace-room',
      isolationMode: 'text-only workspace learning',
      sourceArtifact: 'text-learning agent, no URL fetch, original core untouched',
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
      return result?.suggestions?.length ? result.suggestions : ['私訊「短影音健檢」，取得一份適合你的內容方向'];
    } catch {
      return ['私訊「短影音健檢」，取得一份適合你的內容方向'];
    }
  },

  suggestBoundaries: async (data: Partial<PersonaData>) => {
    try {
      const result = await postJson<{ suggestions: string[] }>('/api/suggest-boundaries', { persona: data });
      return result?.suggestions?.length ? result.suggestions : ['不誇大保證成效', '不使用恐嚇式行銷'];
    } catch {
      return ['不誇大保證成效', '不使用恐嚇式行銷'];
    }
  },

  learnUrl: async (input: { url?: string; text?: string }): Promise<UrlLearningResult> => {
    const textInput = { text: input.text || input.url || '' };
    let learned: UrlLearningResult;
    try {
      learned = await postJson<UrlLearningResult>('/api/learn-text', { persona: currentPersona, input: textInput, learnedTexts: learnedUrls });
    } catch {
      const sourceId = `source_${Date.now()}`;
      learned = {
        id: sourceId,
        background: '已收到使用者提供的文字資料，並整理為 workspace 知識。',
        highlights: '可用於品牌介紹、服務說明、FAQ、銷售話術、社群貼文、EDM 與短影音腳本。',
        audience: currentPersona.tones.length ? `目前語氣可依人設設定：${currentPersona.tones.join('、')}` : '目前文本不足以判斷完整品牌語氣。',
        painPoints: `source_id=${sourceId}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo-workspace-room`,
        topics: '文字匯入 / 文稿素材 / 品牌知識',
        sellingPoints: '可先產出保守版文稿；若需要更精準，請補充價格、活動日期、案例、限制與 CTA。',
        sourceText: textInput.text,
      };
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
      blocks: result.blocks?.length ? result.blocks : fallbackScriptError('模型沒有回傳 blocks').blocks || [],
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
