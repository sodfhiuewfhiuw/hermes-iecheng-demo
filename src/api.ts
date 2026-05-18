import { createClient, Session, User } from '@supabase/supabase-js';

const API_BASE = '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const DEV_SESSION_KEY = 'hermes-dev-session-111';
const DEV_TOKEN = 'dev-local-token-111';

function makeDevSession(): Session {
  return {
    access_token: DEV_TOKEN,
    refresh_token: 'dev-refresh-token-111',
    expires_in: 60 * 60 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    token_type: 'bearer',
    user: {
      id: 'dev-user-111',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: '111',
    },
  } as Session;
}

export interface StatusResponse {
  aiConnected: boolean;
  model: string;
  mode: string;
  promptIntegrity?: string;
  supabaseConfigured?: boolean;
  policy?: string;
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
  deletedAt?: string | null;
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
  speaker?: string;
  visual: string;
  audio: string;
}

export interface QualityCheck {
  hook: string;
  interaction: string;
  cta: string;
  shootability: string;
  risk: string;
  humanSpeech?: string;
}

export interface VoiceDna {
  brandVoice?: string;
  speakingRhythm?: string;
  commonPhrases?: string[];
  forbiddenTone?: string[];
  emotionalTexture?: string;
  personaNotes?: string[];
}

export interface RehearsalLine {
  speaker: string;
  line: string;
  innerOS?: string;
  purpose?: string;
}

export interface StoryBeats {
  hook?: string;
  setup?: string;
  conflict?: string;
  turningPoint?: string;
  ending?: string;
}

export interface PublicResearch {
  industrySnapshot?: string;
  audienceSignals?: string[];
  popularAngles?: string[];
  citations?: string[];
}

export interface PublishPack {
  title?: string;
  subtitleFirstLine?: string;
  cta?: string;
  hashtags?: string[];
}

export interface HumanSpeechCheck {
  overall?: '通過' | '需補強' | '風險';
  aiPublicRelationsTone?: string;
  exaggeratedClaims?: string;
  forbiddenWords?: string;
  humanNaturalness?: string;
  suggestedFixes?: string[];
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
  rehearsalPreview?: RehearsalLine[];
  realLines?: string[];
  storyBeats?: StoryBeats;
  publicResearch?: PublicResearch;
  publishPack?: PublishPack;
  humanSpeechCheck?: HumanSpeechCheck;
  voiceDna?: VoiceDna;
}

export interface MemoryData {
  id: string;
  content: string;
  createdAt: string;
  deletedAt?: string | null;
}

export interface Room {
  id: string;
  workspace_id: string;
  title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RoomMessage {
  id: string;
  workspace_id: string;
  room_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  output_type: 'chat' | 'question' | 'simulation' | 'script' | 'quality_check';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RoomState {
  roomId: string;
  workspaceId: string;
  currentStage: string;
  voiceDna: VoiceDna;
  latestRehearsal: RehearsalLine[];
  realLines: string[];
  storyBeats: StoryBeats;
  openQuestions: string[];
  lastQualityCheck: HumanSpeechCheck | QualityCheck;
  activeScriptDraftId: string | null;
  updatedAt: string;
}

export interface ScriptDraft {
  id: string;
  workspace_id: string;
  room_id: string;
  status: string;
  platform: string;
  purpose: string;
  script_style: string;
  duration_seconds: number;
  roles: string[];
  tones: string[];
  rehearsal_preview: RehearsalLine[];
  real_lines: string[];
  story_beats: StoryBeats;
  blocks: ScriptBlock[];
  citations: string[];
  quality_check: QualityCheck;
  human_speech_check: HumanSpeechCheck;
  publish_pack: PublishPack;
  created_at: string;
}

export interface RoomContextResponse {
  workspace?: { id: string; name: string; role?: string };
  room?: Room;
  state?: RoomState;
  messages?: RoomMessage[];
  documents?: any[];
  memories?: any[];
  drafts?: ScriptDraft[];
  script?: Partial<ScriptData>;
}

const defaultPersona: PersonaData = {
  brandName: 'IE程',
  industry: '短影音策略與操盤',
  role: '短影音腳本生成器',
  audience: '想開始做短影音但不知道怎麼拍的品牌主、個人品牌、在地店家老闆',
  tones: ['自然口語', '專業可信', '台灣在地感'],
  platforms: ['Instagram Reels', 'YouTube Shorts', 'TikTok/抖音'],
  forbiddenWords: '不保證流量、成交或營收；不恐嚇式行銷；不把未提供的功能講成事實。',
  ctaMethod: '把現有素材丟進 HERMES 小房間，先跑一版真人互動腳本。',
  ctaGoal: '引導私訊或留下資料',
  ctaKeyword: '腳本',
  ctaStrength: '中',
  ctaNote: '不要硬銷，要像藏鏡人在旁邊提醒下一步。',
};

let currentPersona = { ...defaultPersona };
let learnedTexts: UrlLearningResult[] = [];
let scriptsLibrary: ScriptData[] = [];
let workspaceMemories: MemoryData[] = [];

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function toScriptData(script: any, params?: ScriptParams): ScriptData {
  return {
    id: script?.id || crypto.randomUUID(),
    platform: script?.platform || params?.platform || '多平台',
    purpose: script?.purpose || params?.purpose || '建立信任',
    scriptStyle: script?.scriptStyle || params?.scriptStyle || '雙人對話',
    durationSeconds: script?.durationSeconds || params?.durationSeconds || 45,
    tones: script?.tones || params?.tones || currentPersona.tones,
    roles: script?.roles || params?.roles || ['品牌主', '藏鏡人'],
    blocks: script?.blocks || [],
    status: 'draft',
    createdAt: new Date().toISOString(),
    hermesJudgement: script?.hermesJudgement,
    usableMaterials: script?.usableMaterials,
    missingInfo: script?.missingInfo,
    safetyCheck: script?.safetyCheck,
    citations: script?.citations || [],
    qualityCheck: script?.qualityCheck,
    rehearsalPreview: script?.rehearsalPreview,
    realLines: script?.realLines,
    storyBeats: script?.storyBeats,
    publicResearch: script?.publicResearch,
    publishPack: script?.publishPack,
    humanSpeechCheck: script?.humanSpeechCheck,
    voiceDna: script?.voiceDna,
  };
}

export const authApi = {
  supabaseConfigured: () => true,
  getSession: async (): Promise<Session | null> => {
    if (!supabase) return localStorage.getItem(DEV_SESSION_KEY) === '1' ? makeDevSession() : null;
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  onAuthStateChange: (callback: (session: Session | null) => void) => {
    if (!supabase) return { unsubscribe: () => undefined };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
    return data.subscription;
  },
  signIn: async (email: string, password: string) => {
    if (!supabase) {
      if (email !== '111' || password !== '111') throw new Error('本機測試帳號密碼都是 111。');
      localStorage.setItem(DEV_SESSION_KEY, '1');
      return makeDevSession();
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },
  signUp: async (email: string, password: string) => {
    if (!supabase) {
      if (email !== '111' || password !== '111') throw new Error('本機測試帳號密碼都是 111。');
      localStorage.setItem(DEV_SESSION_KEY, '1');
      return makeDevSession();
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data.session;
  },
  signOut: async () => {
    if (!supabase) {
      localStorage.removeItem(DEV_SESSION_KEY);
      return;
    }
    if (supabase) await supabase.auth.signOut();
  },
};

export const roomApi = {
  createRoom: (token: string) => request<RoomContextResponse>('/api/rooms', { method: 'POST', body: JSON.stringify({ title: 'HERMES 小房間' }) }, token),
  getState: (roomId: string, token: string) => request<RoomContextResponse>(`/api/rooms/${roomId}/state`, {}, token),
  sendMessage: (roomId: string, token: string, content: string) => request<RoomContextResponse>(`/api/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify({ content }) }, token),
  learnText: (roomId: string, token: string, text: string, title?: string) => request<RoomContextResponse>(`/api/rooms/${roomId}/learn-text`, { method: 'POST', body: JSON.stringify({ text, title }) }, token),
  generateScript: (roomId: string, token: string, persona: PersonaData, params?: ScriptParams) => request<RoomContextResponse>(`/api/rooms/${roomId}/generate-script`, { method: 'POST', body: JSON.stringify({ persona, params }) }, token),
  deleteMemory: (roomId: string, token: string, id: string) => request<{ deleted: boolean; id: string }>(`/api/rooms/${roomId}/delete-memory`, { method: 'POST', body: JSON.stringify({ id }) }, token),
  deleteDocument: (roomId: string, token: string, id: string) => request<{ deleted: boolean; id: string }>(`/api/rooms/${roomId}/delete-document`, { method: 'POST', body: JSON.stringify({ id }) }, token),
};

export const api = {
  getStatus: async (): Promise<StatusResponse> => {
    try {
      return await request<StatusResponse>('/api/status');
    } catch {
      return { aiConnected: false, model: 'offline', mode: 'frontend-fallback', supabaseConfigured: false };
    }
  },

  getState: async () => ({
    workspace: 'Demo Workspace',
    persona: currentPersona,
    learnedUrls: learnedTexts,
    memories: workspaceMemories,
    scripts: scriptsLibrary,
  }),

  updatePersona: async (data: Partial<PersonaData>) => {
    currentPersona = { ...currentPersona, ...data };
    return currentPersona;
  },

  suggestCta: async (data: Partial<PersonaData>) => {
    try {
      const result = await request<{ suggestions: string[] }>('/api/suggest-cta', { method: 'POST', body: JSON.stringify({ persona: data }) });
      return result.suggestions;
    } catch {
      return [
        '想把你的短影音方向整理清楚，可以先私訊「腳本」。',
        '把現有素材丟進 HERMES 小房間，先跑一版真人互動腳本。',
        '如果你不想再寫出公關稿，先讓 IE程 幫你拆一版。',
      ];
    }
  },

  suggestBoundaries: async (data: Partial<PersonaData>) => {
    try {
      const result = await request<{ suggestions: string[] }>('/api/suggest-boundaries', { method: 'POST', body: JSON.stringify({ persona: data }) });
      return result.suggestions;
    } catch {
      return ['不保證流量或成交', '不恐嚇式行銷', '不使用未提供的產品功能', '不碰醫療/投資/法律保證'];
    }
  },

  learnUrl: async (input: { url?: string; text?: string }): Promise<UrlLearningResult> => {
    const text = input.text || input.url || '';
    let result: UrlLearningResult;
    try {
      result = await request<UrlLearningResult>('/api/learn-text', { method: 'POST', body: JSON.stringify({ persona: currentPersona, input: { text } }) });
    } catch {
      result = {
        id: crypto.randomUUID(),
        background: '已將文字放入 Demo 學習層。',
        highlights: '可用於腳本開場、受眾痛點、CTA 與內容邊界。',
        audience: currentPersona.audience,
        painPoints: `source_id=${Date.now()}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo`,
        topics: '短影音素材 / 人設 / CTA',
        sellingPoints: '把原始文字整理成可拍攝文稿素材。',
        sourceText: text,
      };
    }
    learnedTexts = [result, ...learnedTexts];
    return result;
  },

  deleteLearning: async (id: string) => {
    learnedTexts = learnedTexts.filter((item) => item.id !== id);
    scriptsLibrary = scriptsLibrary.map((script) => ({
      ...script,
      citations: (script.citations || []).map((citation) => citation.includes(id) ? `${citation}（來源已刪除）` : citation),
    }));
    return { deleted: true, id, scripts: scriptsLibrary };
  },

  generateScript: async (params: ScriptParams) => {
    const result = await request<any>('/api/scripts', {
      method: 'POST',
      body: JSON.stringify({
        persona: currentPersona,
        cta: {
          goal: currentPersona.ctaGoal,
          keyword: currentPersona.ctaKeyword,
          strength: currentPersona.ctaStrength,
          note: currentPersona.ctaNote,
          finalText: currentPersona.ctaMethod,
        },
        forbiddenWords: currentPersona.forbiddenWords,
        learnedUrls: learnedTexts,
        memories: workspaceMemories,
        params,
      }),
    }).catch(() => null);
    const script = toScriptData(result, params);
    scriptsLibrary = [script, ...scriptsLibrary];
    return script;
  },

  rewriteScript: async (id: string, action: string) => {
    const base = scriptsLibrary.find((script) => script.id === id);
    if (!base) throw new Error('找不到腳本');
    const result = await request<any>('/api/rewrite-script', { method: 'POST', body: JSON.stringify({ script: base, action, persona: currentPersona }) }).catch(() => null);
    const script = { ...base, ...toScriptData(result || base), id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    scriptsLibrary = [script, ...scriptsLibrary];
    return script;
  },

  addMemory: async (content: string) => {
    const memory = { id: crypto.randomUUID(), content, createdAt: new Date().toISOString() };
    workspaceMemories = [memory, ...workspaceMemories];
    return memory;
  },

  deleteMemory: async (id: string) => {
    workspaceMemories = workspaceMemories.filter((memory) => memory.id !== id);
    return { deleted: true, id };
  },

  updateScriptStatus: async (id: string, status: ScriptData['status']) => {
    const script = scriptsLibrary.find((item) => item.id === id);
    if (script) script.status = status;
    return script;
  },
};

export type AuthUser = User;
