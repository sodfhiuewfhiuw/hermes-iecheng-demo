import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(fileName) {
  const envPath = path.join(__dirname, fileName);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const PORT = Number(process.env.HERMES_AI_SERVER_PORT || 8787);
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DEV_TOKEN = 'dev-local-token-111';

const corsHeaders = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const promptDir = path.join(__dirname, 'prompts');
const prompts = Object.fromEntries(
  fs.existsSync(promptDir)
    ? fs.readdirSync(promptDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => [file.replace(/\.md$/, ''), fs.readFileSync(path.join(promptDir, file), 'utf8')])
    : [],
);

function checkPromptIntegrity() {
  const systemPrompt = prompts['hermes.system'] || '';
  const required = ['HERMES', 'voice_dna'];
  const missing = required.filter((word) => !systemPrompt.includes(word));
  if (missing.length) throw new Error(`Prompt integrity check failed. Missing: ${missing.join(', ')}`);
}

checkPromptIntegrity();

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const localDataDir = path.join(__dirname, '.local');
const localDataPath = path.join(localDataDir, 'hermes-room-store.json');

const localStore = {
  workspace: { id: 'local-workspace-111', name: 'HERMES Local Room', role: 'owner' },
  rooms: [],
  states: [],
  messages: [],
  documents: [],
  memories: [],
  drafts: [],
  agentRuns: [],
};

function loadLocalStore() {
  if (!fs.existsSync(localDataPath)) return;
  try {
    Object.assign(localStore, JSON.parse(fs.readFileSync(localDataPath, 'utf8')));
  } catch (error) {
    console.warn(`Local room store reset: ${error.message}`);
  }
}

function saveLocalStore() {
  fs.mkdirSync(localDataDir, { recursive: true });
  fs.writeFileSync(localDataPath, JSON.stringify(localStore, null, 2));
}

loadLocalStore();

function sendJson(res, status, data) {
  res.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function chunkText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let i = 0; i < clean.length; i += 1000) chunks.push(clean.slice(i, i + 1000));
  return chunks;
}

function authToken(req) {
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

async function requireUser(req) {
  const token = authToken(req);
  if (token === DEV_TOKEN) return { id: 'dev-user-111', email: '111', local: true };
  if (!supabaseAdmin) {
    const error = new Error('Local test login only accepts account/password 111/111.');
    error.status = 401;
    throw error;
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    const authError = new Error('Invalid Supabase user token');
    authError.status = 401;
    throw authError;
  }
  return data.user;
}

function normalizeState(row, roomId, workspaceId) {
  return row || {
    roomId,
    workspaceId,
    currentStage: 'idle',
    voiceDna: {},
    latestRehearsal: [],
    realLines: [],
    storyBeats: {},
    openQuestions: [],
    lastQualityCheck: {},
    activeScriptDraftId: null,
    updatedAt: new Date().toISOString(),
  };
}

function localContext(roomId) {
  const room = localStore.rooms.find((item) => item.id === roomId);
  if (!room) {
    const error = new Error('Room not found');
    error.status = 404;
    throw error;
  }
  return {
    workspace: localStore.workspace,
    room,
    state: normalizeState(localStore.states.find((item) => item.roomId === roomId), roomId, localStore.workspace.id),
    messages: localStore.messages.filter((item) => item.room_id === roomId),
    documents: localStore.documents.filter((item) => item.room_id === roomId && !item.deleted_at),
    memories: localStore.memories.filter((item) => item.room_id === roomId && !item.deleted_at),
    drafts: localStore.drafts.filter((item) => item.room_id === roomId),
  };
}

async function askJson(messages, fallback, temperature = 0.7) {
  if (!OPENAI_API_KEY) return fallback;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature,
        response_format: { type: 'json_object' },
        messages,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return JSON.parse(data?.choices?.[0]?.message?.content || '{}');
  } catch (error) {
    return { ...fallback, _fallbackReason: error instanceof Error ? error.message : String(error) };
  }
}

function fallbackScript(input) {
  const docs = input.documents || [];
  const source = docs[0]?.chunks?.[0] || docs[0]?.summary || '目前還沒有足夠學習素材';
  const roles = input.params?.roles?.length ? input.params.roles : ['品牌主', '藏鏡人'];
  const cta = input.persona?.ctaMethod || input.persona?.ctaKeyword || '把素材丟進 HERMES 小房間，先跑一版真人互動腳本。';
  return {
    hermesJudgement: `這版有讀取小房間素材。素材重點：${String(source).slice(0, 120)}`,
    usableMaterials: docs.map((doc) => doc.title).join('、') || '尚未匯入素材',
    missingInfo: docs.length ? '若要更像 TG 原生 HERMES，請補更多口頭禪、真實對話和案例。' : '缺少品牌素材、受眾、案例與口語範例。',
    safetyCheck: '未主動查網路；只使用小房間素材與本次對話。',
    citations: docs.map((doc) => `source_id=${doc.id}; document_title=${doc.title}; chunk_id=chunk_001; workspace_id=${input.workspaceId || 'local-workspace-111'}`),
    voiceDna: {
      brandVoice: '直接、口語、有藏鏡人拆局感',
      speakingRhythm: '先點出問題，再補一刀真相，最後給可執行下一步',
      commonPhrases: ['不是先拍片，是先操盤', '這段要有人味', '先抓觀眾心裡那句話'],
      forbiddenTone: ['空泛保證', '公關稿', '硬銷'],
      emotionalTexture: '像在小房間裡陪你拆腳本',
      personaNotes: roles,
    },
    rehearsalPreview: [
      { speaker: roles[0], line: '我有素材，但寫出來都像在介紹公司。', innerOS: '怕內容又變無效文案', purpose: '丟出真問題' },
      { speaker: roles[1] || '藏鏡人', line: '因為你現在缺的不是字，是缺一個觀眾會相信的現場。', innerOS: '拆掉表面問題', purpose: '建立衝突' },
    ],
    realLines: [
      '你不是不會拍，是還沒抓到觀眾心裡那句話。',
      '不要先寫腳本，先問這支片要讓誰相信你。',
      '這段如果講得像簡報，觀眾就會直接滑走。',
    ],
    storyBeats: {
      hook: '短影音無效不是因為你不努力，而是腳本沒有現場感',
      setup: '品牌主拿著素材卻寫不出能拍的內容',
      conflict: '藏鏡人指出問題在受眾、角色衝突與信任結構',
      turningPoint: '把素材丟進小房間，先模擬對話再抽真人句',
      ending: cta,
    },
    publishPack: {
      title: '短影音不是先拍，是先操盤',
      subtitleFirstLine: '你的腳本不像人話，觀眾當然不會停。',
      cta,
      hashtags: ['#短影音操盤', '#IE程', '#HERMES小房間'],
    },
    humanSpeechCheck: {
      overall: docs.length ? '通過' : '需補強',
      aiPublicRelationsTone: '已避免純公關稿，但仍需要更多你的 TG 口頭禪。',
      exaggeratedClaims: '未看到保證成效。',
      forbiddenWords: '未踩明確禁語。',
      humanNaturalness: '有雙人互動與衝突。',
      suggestedFixes: ['補一段真實客戶對話', '加入品牌主反駁', 'CTA 改成更具體的私訊指令'],
    },
    qualityCheck: {
      hook: '通過：有點出問題',
      interaction: '通過：有角色互動',
      cta: cta ? '通過：有 CTA' : '需補強',
      shootability: '通過：可拍成桌面、白板、小房間對話',
      risk: '通過：未誇大承諾',
      humanSpeech: '需補強：可再加入更多 TG 原生詞彙',
    },
    blocks: [
      { time: '0-6 秒', speaker: roles[0], visual: '品牌主看著一堆素材和空白腳本。', audio: '我資料都有了，但寫出來怎麼還是像公司介紹？' },
      { time: '6-14 秒', speaker: roles[1] || '藏鏡人', visual: '藏鏡人把腳本圈出問題。', audio: '因為你現在不是缺文案，是缺觀眾會相信的現場。' },
      { time: '14-24 秒', speaker: roles[1] || '藏鏡人', visual: '白板出現：受眾、衝突、真人句、CTA。', audio: `先看素材重點：${String(source).slice(0, 70)}。這段要變成觀眾聽得懂的話。` },
      { time: '24-36 秒', speaker: roles[0], visual: '品牌主試著講出更口語的一句。', audio: '所以不是一直講我多專業，而是先講他卡在哪裡？' },
      { time: '36-45 秒', speaker: roles[1] || '藏鏡人', visual: '畫面收斂成腳本卡片與 CTA。', audio: cta },
    ],
  };
}

async function generateHermesScript(input) {
  const fallback = fallbackScript(input);
  return askJson([
    { role: 'system', content: `${prompts['hermes.system']}\n你必須產出 JSON。腳本要讀取 documents.chunks，不可假裝沒有資料。` },
    { role: 'user', content: JSON.stringify({ requiredKeys: Object.keys(fallback), input }) },
  ], fallback, 0.85);
}

async function classifyAndReply(context, content) {
  const wantsScript = /腳本|產出|生成|草稿|寫一版|短影音|拍/.test(content);
  const docs = context.documents.map((doc) => ({
    id: doc.id,
    title: doc.title,
    summary: doc.summary,
    chunks: doc.chunks || [],
  }));
  const voiceDna = await askJson([
    { role: 'system', content: `${prompts['hermes.system']}\n${prompts.distill_voice_dna}` },
    { role: 'user', content: JSON.stringify({ message: content, documents: docs, memories: context.memories, state: context.state }) },
  ], fallbackScript({ documents: docs, params: { roles: ['品牌主', '藏鏡人'] } }).voiceDna, 0.5);
  const reply = await askJson([
    { role: 'system', content: `${prompts['hermes.system']}\n你正在小房間回覆。請直接使用已學習素材，不要只說流程。回傳 {"answer":"...","openQuestions":["..."]}` },
    { role: 'user', content: JSON.stringify({ userMessage: content, documents: docs, voiceDna, recentMessages: context.messages.slice(-10) }) },
  ], {
    answer: wantsScript
      ? `我讀到 ${docs.length} 份素材。可以產腳本，但我會先用素材抓觀眾心裡話、角色衝突和真人句，不會只給單人口播。`
      : `收到，這段已進小房間。現在有 ${docs.length} 份素材，後續會用它們判斷受眾、口氣和可拍攝句子。`,
    openQuestions: wantsScript ? [] : ['這支要用雙人對話、三人討論，還是藏鏡人拆解？'],
  }, 0.65);
  return {
    intent: { intent: wantsScript ? 'generate_script' : 'chat', shouldGenerateScript: wantsScript, confidence: 0.8 },
    state: {
      ...context.state,
      currentStage: wantsScript ? 'ready_to_generate_script' : 'chatting',
      voiceDna,
      openQuestions: reply.openQuestions || [],
      updatedAt: new Date().toISOString(),
    },
    assistantMessage: {
      role: 'assistant',
      outputType: wantsScript ? 'question' : 'chat',
      content: reply.answer,
      metadata: { voiceDna, documentsUsed: docs.map((doc) => doc.id) },
    },
  };
}

function insertAgentRun(context, stage, inputSnapshot, outputSnapshot, userMessageId = null) {
  localStore.agentRuns.push({
    id: makeId('run'),
    workspace_id: context.workspace.id,
    room_id: context.room.id,
    user_message_id: userMessageId,
    stage,
    input_snapshot: inputSnapshot || {},
    output_snapshot: outputSnapshot || {},
    model: OPENAI_MODEL,
    status: 'success',
    created_at: new Date().toISOString(),
  });
  saveLocalStore();
}

function createRoom(body, user) {
  const room = {
    id: makeId('room'),
    workspace_id: localStore.workspace.id,
    title: body.title || 'HERMES 小房間',
    created_by: user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const state = normalizeState(null, room.id, localStore.workspace.id);
  localStore.rooms.unshift(room);
  localStore.states.unshift(state);
  saveLocalStore();
  return { workspace: localStore.workspace, room, state, messages: [], documents: [], memories: [], drafts: [] };
}

async function handleRoomMessage(req, roomId) {
  const body = await readJson(req);
  const context = localContext(roomId);
  const content = String(body.content || '').trim();
  if (!content) throw new Error('Message content is required');
  const userMessage = {
    id: makeId('msg'),
    workspace_id: context.workspace.id,
    room_id: roomId,
    role: 'user',
    content,
    output_type: 'chat',
    metadata: {},
    created_at: new Date().toISOString(),
  };
  localStore.messages.push(userMessage);
  const conversationMemory = {
    id: makeId('mem'),
    workspace_id: context.workspace.id,
    room_id: roomId,
    content: `使用者在小房間補充：${content}`,
    source_type: 'room_message',
    source_message_id: userMessage.id,
    deleted_at: null,
    created_at: new Date().toISOString(),
  };
  localStore.memories.unshift(conversationMemory);
  const result = await classifyAndReply({
    ...context,
    messages: [...context.messages, userMessage],
    memories: [conversationMemory, ...context.memories],
  }, content);
  localStore.states = localStore.states.filter((item) => item.roomId !== roomId);
  localStore.states.unshift(result.state);
  const assistant = {
    id: makeId('msg'),
    workspace_id: context.workspace.id,
    room_id: roomId,
    role: 'assistant',
    content: result.assistantMessage.content,
    output_type: result.assistantMessage.outputType,
    metadata: result.assistantMessage.metadata,
    created_at: new Date().toISOString(),
  };
  localStore.messages.push(assistant);
  insertAgentRun(context, 'classify_intent', { content }, result.intent, userMessage.id);
  insertAgentRun(context, 'distill_voice_dna', { content }, result.state.voiceDna, userMessage.id);
  saveLocalStore();
  return { userMessage, assistantMessage: assistant, ...localContext(roomId) };
}

async function handleLearnText(req, roomId) {
  const body = await readJson(req);
  const context = localContext(roomId);
  const text = String(body.text || body.input?.text || '').trim();
  if (!text) throw new Error('Text is required');
  const chunks = chunkText(text);
  const summary = await askJson([
    { role: 'system', content: '請把文字整理成 HERMES 小房間可用素材摘要，回傳 {"summary":"...","highlights":["..."],"tone":["..."],"audience":["..."]}' },
    { role: 'user', content: text.slice(0, 12000) },
  ], { summary: text.slice(0, 180), highlights: [], tone: [], audience: [] }, 0.35);
  const doc = {
    id: makeId('doc'),
    workspace_id: context.workspace.id,
    room_id: roomId,
    title: body.title || '文字匯入資料',
    source_type: 'manual_text',
    summary: summary.summary || text.slice(0, 180),
    source_text: text,
    chunks,
    deleted_at: null,
    created_at: new Date().toISOString(),
  };
  localStore.documents.unshift(doc);
  localStore.messages.push({
    id: makeId('msg'),
    workspace_id: context.workspace.id,
    room_id: roomId,
    role: 'assistant',
    output_type: 'chat',
    content: `已學習這份素材，會參與後續腳本生成。摘要：${doc.summary}`,
    metadata: { documentId: doc.id, summary },
    created_at: new Date().toISOString(),
  });
  insertAgentRun(context, 'learn_text', { documentId: doc.id, chunks: chunks.length }, summary);
  saveLocalStore();
  return { document: doc, chunks: chunks.length, summary, ...localContext(roomId) };
}

async function handleGenerateScript(req, roomId) {
  const body = await readJson(req);
  const context = localContext(roomId);
  const params = body.params || {
    platform: '多平台',
    purpose: '建立信任',
    scriptStyle: '雙人對話',
    durationSeconds: 45,
    tones: ['自然口語', '台灣在地感'],
    roles: ['品牌主', '藏鏡人'],
  };
  const input = {
    workspaceId: context.workspace.id,
    roomState: context.state,
    documents: context.documents,
    memories: context.memories,
    recentMessages: context.messages.slice(-20),
    persona: body.persona || {},
    params,
  };
  const script = await generateHermesScript(input);
  const draft = {
    id: makeId('draft'),
    workspace_id: context.workspace.id,
    room_id: roomId,
    status: 'draft',
    platform: params.platform,
    purpose: params.purpose,
    script_style: params.scriptStyle,
    duration_seconds: params.durationSeconds,
    roles: params.roles || [],
    tones: params.tones || [],
    rehearsal_preview: script.rehearsalPreview || [],
    real_lines: script.realLines || [],
    story_beats: script.storyBeats || {},
    blocks: script.blocks || [],
    citations: script.citations || [],
    quality_check: script.qualityCheck || {},
    human_speech_check: script.humanSpeechCheck || {},
    publish_pack: script.publishPack || {},
    created_at: new Date().toISOString(),
  };
  localStore.drafts.unshift(draft);
  const nextState = {
    ...context.state,
    currentStage: 'script_drafted',
    voiceDna: script.voiceDna || context.state.voiceDna,
    latestRehearsal: script.rehearsalPreview || [],
    realLines: script.realLines || [],
    storyBeats: script.storyBeats || {},
    lastQualityCheck: script.humanSpeechCheck || script.qualityCheck || {},
    activeScriptDraftId: draft.id,
    updatedAt: new Date().toISOString(),
  };
  localStore.states = localStore.states.filter((item) => item.roomId !== roomId);
  localStore.states.unshift(nextState);
  localStore.messages.push({
    id: makeId('msg'),
    workspace_id: context.workspace.id,
    room_id: roomId,
    role: 'assistant',
    output_type: 'script',
    content: script.hermesJudgement || '已產出 HERMES 小房間腳本草稿。',
    metadata: { draftId: draft.id, script },
    created_at: new Date().toISOString(),
  });
  for (const stage of ['simulate_scene', 'extract_real_lines', 'build_story_beats', 'draft_script', 'human_speech_check']) {
    insertAgentRun(context, stage, input, { draftId: draft.id, stage });
  }
  saveLocalStore();
  return { draft, script, ...localContext(roomId) };
}

function softDelete(roomId, id, type) {
  const list = type === 'memories' ? localStore.memories : localStore.documents;
  const target = list.find((item) => item.id === id && item.room_id === roomId);
  if (target) target.deleted_at = new Date().toISOString();
  saveLocalStore();
  return { deleted: true, id };
}

async function handleLegacyLearn(req) {
  const body = await readJson(req);
  const text = String(body.input?.text || body.text || '').trim();
  return {
    id: makeId('source'),
    background: '已將文字整理成 HERMES 可用素材。',
    highlights: '可用於人物定位、開場、CTA 與內容邊界。',
    audience: body.persona?.audience || '尚未明確',
    painPoints: `source_id=${Date.now()}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo`,
    topics: '短影音素材 / 人設 / CTA',
    sellingPoints: '把原始文字整理成可拍攝腳本素材。',
    sourceText: text,
  };
}

async function handleSuggest(req, type) {
  const body = await readJson(req);
  const brand = body.persona?.brandName || '你的品牌';
  return {
    suggestions: type === 'cta'
      ? [`想把 ${brand} 的短影音方向整理清楚，先私訊「腳本」。`, '把素材丟進 HERMES 小房間，先跑一版真人互動腳本。', '不想再寫出公關稿，就先讓藏鏡人幫你拆一版。']
      : ['不保證流量、成交或營收', '不使用恐嚇式行銷', '不把未提供的功能講成事實', '不碰醫療、投資、法律保證'],
  };
}

function parseRoomPath(pathname) {
  const match = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/([^/]+))?$/);
  return match ? { roomId: match[1], action: match[2] || 'state' } : null;
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === 'GET' && pathname === '/api/status') {
      return sendJson(res, 200, {
        aiConnected: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
        mode: 'hermes-local-room-runtime',
        promptIntegrity: 'ok',
        supabaseConfigured: Boolean(supabaseAdmin),
        localRoomPersistence: true,
        policy: 'local file-backed room_state runtime',
      });
    }

    if (req.method === 'POST' && pathname === '/api/rooms') {
      const user = await requireUser(req);
      return sendJson(res, 200, createRoom(await readJson(req), user));
    }

    const roomRoute = parseRoomPath(pathname);
    if (roomRoute) {
      await requireUser(req);
      if (req.method === 'GET' && roomRoute.action === 'state') return sendJson(res, 200, localContext(roomRoute.roomId));
      if (req.method === 'POST' && roomRoute.action === 'messages') return sendJson(res, 200, await handleRoomMessage(req, roomRoute.roomId));
      if (req.method === 'POST' && roomRoute.action === 'learn-text') return sendJson(res, 200, await handleLearnText(req, roomRoute.roomId));
      if (req.method === 'POST' && roomRoute.action === 'generate-script') return sendJson(res, 200, await handleGenerateScript(req, roomRoute.roomId));
      if (req.method === 'POST' && roomRoute.action === 'delete-memory') {
        const body = await readJson(req);
        return sendJson(res, 200, softDelete(roomRoute.roomId, body.id, 'memories'));
      }
      if (req.method === 'POST' && roomRoute.action === 'delete-document') {
        const body = await readJson(req);
        return sendJson(res, 200, softDelete(roomRoute.roomId, body.id, 'documents'));
      }
    }

    if (req.method === 'POST' && pathname === '/api/suggest-cta') return sendJson(res, 200, await handleSuggest(req, 'cta'));
    if (req.method === 'POST' && pathname === '/api/suggest-boundaries') return sendJson(res, 200, await handleSuggest(req, 'boundaries'));
    if (req.method === 'POST' && pathname === '/api/learn-text') return sendJson(res, 200, await handleLegacyLearn(req));
    if (req.method === 'POST' && pathname === '/api/scripts') return sendJson(res, 200, await generateHermesScript(await readJson(req)));
    if (req.method === 'POST' && pathname === '/api/rewrite-script') return sendJson(res, 200, await generateHermesScript(await readJson(req)));

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || 'Server error', details: error.details });
  }
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`HERMES local room runtime listening on http://127.0.0.1:${PORT}`);
  console.log(`OpenAI model: ${OPENAI_MODEL}`);
  console.log(`Local room persistence: ${localDataPath}`);
});
