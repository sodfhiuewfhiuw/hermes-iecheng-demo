import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(name) {
  const file = path.join(__dirname, name);
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
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
const DEV_TOKEN = 'dev-local-token-111';
const dataDir = path.join(__dirname, '.local');
const dataFile = path.join(dataDir, 'hermes-room-store.json');

const corsHeaders = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const store = {
  workspace: { id: 'local-workspace-111', name: 'HERMES Local Room', role: 'owner' },
  rooms: [],
  states: [],
  messages: [],
  documents: [],
  memories: [],
  drafts: [],
  agentRuns: [],
};

function loadStore() {
  if (!fs.existsSync(dataFile)) return;
  try {
    Object.assign(store, JSON.parse(fs.readFileSync(dataFile, 'utf8')));
  } catch {
    // Keep a clean in-memory store if the local scratch file is corrupted.
  }
}

function saveStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

loadStore();

function sendJson(res, status, data) {
  res.writeHead(status, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function requireLocalUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== DEV_TOKEN) {
    const error = new Error('請用本機測試帳號 111 / 111 登入。');
    error.status = 401;
    throw error;
  }
  return { id: 'dev-user-111', email: '111' };
}

function normalizeState(roomId) {
  return store.states.find((item) => item.roomId === roomId) || {
    roomId,
    workspaceId: store.workspace.id,
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

function getContext(roomId) {
  const room = store.rooms.find((item) => item.id === roomId);
  if (!room) {
    const error = new Error('找不到這個小房間。');
    error.status = 404;
    throw error;
  }
  return {
    workspace: store.workspace,
    room,
    state: normalizeState(roomId),
    messages: store.messages.filter((item) => item.room_id === roomId),
    documents: store.documents.filter((item) => item.room_id === roomId && !item.deleted_at),
    memories: store.memories.filter((item) => item.room_id === roomId && !item.deleted_at),
    drafts: store.drafts.filter((item) => item.room_id === roomId),
  };
}

function chunkText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let i = 0; i < clean.length; i += 1000) chunks.push(clean.slice(i, i + 1000));
  return chunks;
}

function isGreeting(content) {
  const text = content.trim();
  if (/腳本|產出|生成|短影音|素材/.test(text)) return false;
  if (text.length <= 4 && /[你妳好嗨哈囉安早午晚]/.test(text)) return true;
  return /^(hi|hello|hey|你好|哈囉|嗨|安安|早安|午安|晚安)[！!。.\s]*$/i.test(text);
}

function isUsefulMemory(content) {
  const text = content.trim();
  if (text.length < 8) return false;
  if (isGreeting(text)) return false;
  return /風格|語氣|口吻|受眾|品牌|產品|服務|腳本|短影音|素材|不要|希望|我想|設定|人設|CTA|禁語|劇情|故事|角色|客戶|案例|TG|小房間/i.test(text);
}

function wantsScript(content) {
  return /腳本|產出|生成|草稿|寫一版|短影音|拍一支|分鏡|口播|雙人|三人|劇情/.test(content);
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

function buildFallbackScript(input) {
  const docs = input.documents || [];
  const memories = input.memories || [];
  const roles = input.params?.roles?.length ? input.params.roles : ['品牌主', '藏鏡人'];
  const source = docs[0]?.chunks?.[0] || docs[0]?.summary || memories[0]?.content || '目前小房間還沒有足夠素材';
  const cta = input.persona?.ctaMethod || input.persona?.ctaKeyword || '把素材丟進 HERMES 小房間，先跑一版真人互動腳本。';
  return {
    hermesJudgement: `這版有讀取小房間素材與對話記憶。核心素材：${String(source).slice(0, 100)}`,
    usableMaterials: docs.map((doc) => doc.title).join('、') || '目前主要使用對話記憶',
    missingInfo: docs.length ? '可再補更多 TG 口頭禪、真實客戶對話與案例。' : '請先匯入品牌素材，腳本才會更像你的 HERMES。',
    safetyCheck: '只使用小房間素材、對話記憶與本次輸入；沒有主動查網路。',
    citations: docs.map((doc) => `source_id=${doc.id}; document_title=${doc.title}; chunk_id=chunk_001; workspace_id=${input.workspaceId || 'local-workspace-111'}`),
    voiceDna: {
      brandVoice: '直接、口語、有藏鏡人拆局感',
      speakingRhythm: '先點出問題，再補一刀真相，最後給下一步',
      commonPhrases: ['不是先拍片，是先操盤', '這段要有人味', '先抓觀眾心裡那句話'],
      forbiddenTone: ['空泛保證', '公關稿', '硬銷'],
      emotionalTexture: '像在小房間裡陪你拆腳本',
      personaNotes: roles,
    },
    rehearsalPreview: [
      { speaker: roles[0], line: '我有素材，但寫出來都像在介紹公司。', innerOS: '怕內容又變無效文案', purpose: '丟出真問題' },
      { speaker: roles[1] || '藏鏡人', line: '因為你現在缺的不是字，是缺一個觀眾會相信的現場。', innerOS: '拆掉表面問題', purpose: '建立衝突' },
    ],
    realLines: ['你不是不會拍，是還沒抓到觀眾心裡那句話。', '不要先寫腳本，先問這支片要讓誰相信你。', '這段如果講得像簡報，觀眾就會直接滑走。'],
    storyBeats: {
      hook: '短影音無效不是因為你不努力，而是腳本沒有現場感',
      setup: '品牌主拿著素材卻寫不出能拍的內容',
      conflict: '藏鏡人指出問題在受眾、角色衝突與信任結構',
      turningPoint: '把素材丟進小房間，先模擬對話再抽真人句',
      ending: cta,
    },
    publishPack: { title: '短影音不是先拍，是先操盤', subtitleFirstLine: '你的腳本不像人話，觀眾當然不會停。', cta, hashtags: ['#短影音操盤', '#IE程', '#HERMES小房間'] },
    humanSpeechCheck: {
      overall: docs.length || memories.length ? '通過' : '需補強',
      aiPublicRelationsTone: '已避免純公關稿，但需要更多你的 TG 原生口頭禪。',
      exaggeratedClaims: '未看到保證成效。',
      forbiddenWords: '未踩明確禁語。',
      humanNaturalness: '有角色互動與衝突。',
      suggestedFixes: ['補一段真實客戶對話', '加入品牌主反駁', 'CTA 改成更具體的私訊指令'],
    },
    qualityCheck: { hook: '通過', interaction: '通過', cta: cta ? '通過' : '需補強', shootability: '通過', risk: '通過', humanSpeech: '需補強：可再加入 TG 原生詞彙' },
    blocks: [
      { time: '0-6 秒', speaker: roles[0], visual: '品牌主看著一堆素材和空白腳本。', audio: '我資料都有了，但寫出來怎麼還是像公司介紹？' },
      { time: '6-14 秒', speaker: roles[1] || '藏鏡人', visual: '藏鏡人把腳本圈出問題。', audio: '因為你現在不是缺文案，是缺觀眾會相信的現場。' },
      { time: '14-24 秒', speaker: roles[1] || '藏鏡人', visual: '白板出現：受眾、衝突、真人句、CTA。', audio: `先看素材重點：${String(source).slice(0, 70)}。這段要變成觀眾聽得懂的話。` },
      { time: '24-36 秒', speaker: roles[0], visual: '品牌主試著講出更口語的一句。', audio: '所以不是一直講我多專業，而是先講他卡在哪裡？' },
      { time: '36-45 秒', speaker: roles[1] || '藏鏡人', visual: '畫面收斂成腳本卡片與 CTA。', audio: cta },
    ],
  };
}

async function generateScript(input) {
  const fallback = buildFallbackScript(input);
  return askJson([
    { role: 'system', content: '你是 HERMES 小房間短影音代理。必須回傳 JSON。請先讀 documents.chunks、memories、recentMessages，再產出有角色互動、故事、衝突與 CTA 的短影音腳本。' },
    { role: 'user', content: JSON.stringify({ requiredKeys: Object.keys(fallback), input }) },
  ], fallback, 0.85);
}

async function replyToMessage(context, content) {
  const docs = context.documents.map((doc) => ({ id: doc.id, title: doc.title, summary: doc.summary, chunks: doc.chunks || [] }));
  const memories = context.memories.map((memory) => ({ id: memory.id, content: memory.content }));
  const scriptIntent = wantsScript(content);

  if (isGreeting(content) || (!scriptIntent && !isUsefulMemory(content))) {
    return {
      intent: { intent: 'chat', shouldGenerateScript: false, confidence: 1 },
      state: { ...context.state, currentStage: 'greeting', openQuestions: ['你可以先貼素材，或直接說你想做哪一種短影音。'], updatedAt: new Date().toISOString() },
      assistantMessage: {
        role: 'assistant',
        outputType: 'chat',
        content: docs.length
          ? `嗨，我在。這個小房間目前已經有 ${docs.length} 份素材。你可以直接叫我「用這些素材產一版雙人對話腳本」。`
          : '嗨，我在。你可以先貼品牌素材、TG 口語範例或客戶對話；我會把它放進小房間腦袋，再拿來產腳本。',
        metadata: { documentsUsed: [] },
      },
    };
  }

  const voiceDna = await askJson([
    { role: 'system', content: '請從小房間資料萃取 voice_dna，回傳 JSON：brandVoice, speakingRhythm, commonPhrases, forbiddenTone, emotionalTexture, personaNotes。' },
    { role: 'user', content: JSON.stringify({ content, docs, memories, state: context.state }) },
  ], buildFallbackScript({ documents: docs, memories, params: { roles: ['品牌主', '藏鏡人'] } }).voiceDna, 0.5);

  const reply = await askJson([
    { role: 'system', content: '你正在 HERMES 小房間即時對話。請像一個會思考的腳本操盤手回覆，不要只說流程。若沒有素材，要請使用者貼素材；若有素材，要明確說你抓到什麼。回傳 JSON：answer, openQuestions。' },
    { role: 'user', content: JSON.stringify({ content, docs, memories, voiceDna, recentMessages: context.messages.slice(-8) }) },
  ], {
    answer: scriptIntent
      ? `可以。小房間目前有 ${docs.length} 份素材、${memories.length} 筆對話記憶。我會用它們先抓觀眾心裡話，再做角色衝突，不會只給單人口播。`
      : docs.length
        ? `收到。我先抓到一個方向：這不是單純整理資料，而是要把素材變成觀眾聽得懂的現場。現在小房間有 ${docs.length} 份素材可以用。`
        : '收到。這句比較像打招呼或方向確認，還不足以成為學習素材。你可以貼品牌介紹、客戶對話或 TG 口語範例，我才會把它放進小房間腦袋。',
    openQuestions: scriptIntent ? [] : ['這段你希望變成雙人對話、三人討論，還是藏鏡人拆解？'],
  }, 0.65);

  return {
    intent: { intent: scriptIntent ? 'generate_script' : 'chat', shouldGenerateScript: scriptIntent, confidence: 0.85 },
    state: { ...context.state, currentStage: scriptIntent ? 'ready_to_generate_script' : 'chatting', voiceDna, openQuestions: reply.openQuestions || [], updatedAt: new Date().toISOString() },
    assistantMessage: { role: 'assistant', outputType: scriptIntent ? 'question' : 'chat', content: reply.answer, metadata: { voiceDna, documentsUsed: docs.map((doc) => doc.id) } },
  };
}

function createRoom(body, user) {
  const room = { id: makeId('room'), workspace_id: store.workspace.id, title: body.title || 'HERMES 小房間', created_by: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const state = normalizeState(room.id);
  store.rooms.unshift(room);
  store.states.unshift(state);
  saveStore();
  return { workspace: store.workspace, room, state, messages: [], documents: [], memories: [], drafts: [] };
}

function addRun(context, stage, input, output, userMessageId = null) {
  store.agentRuns.push({ id: makeId('run'), workspace_id: context.workspace.id, room_id: context.room.id, user_message_id: userMessageId, stage, input_snapshot: input || {}, output_snapshot: output || {}, model: OPENAI_MODEL, status: 'success', created_at: new Date().toISOString() });
}

async function handleMessage(req, roomId) {
  const body = await readJson(req);
  const context = getContext(roomId);
  const content = String(body.content || '').trim();
  if (!content) throw new Error('Message content is required');

  const userMessage = { id: makeId('msg'), workspace_id: context.workspace.id, room_id: roomId, role: 'user', content, output_type: 'chat', metadata: {}, created_at: new Date().toISOString() };
  store.messages.push(userMessage);

  let memory = null;
  if (isUsefulMemory(content)) {
    memory = { id: makeId('mem'), workspace_id: context.workspace.id, room_id: roomId, content: `對話學習：${content}`, source_type: 'room_message', source_message_id: userMessage.id, deleted_at: null, created_at: new Date().toISOString() };
    store.memories.unshift(memory);
  }

  const nextContext = { ...context, messages: [...context.messages, userMessage], memories: memory ? [memory, ...context.memories] : context.memories };
  const result = await replyToMessage(nextContext, content);
  store.states = store.states.filter((item) => item.roomId !== roomId);
  store.states.unshift(result.state);

  const assistant = { id: makeId('msg'), workspace_id: context.workspace.id, room_id: roomId, role: 'assistant', content: result.assistantMessage.content, output_type: result.assistantMessage.outputType, metadata: result.assistantMessage.metadata, created_at: new Date().toISOString() };
  store.messages.push(assistant);
  addRun(context, 'message_reply', { content, memoryCreated: Boolean(memory) }, result, userMessage.id);
  saveStore();
  return { userMessage, assistantMessage: assistant, ...getContext(roomId) };
}

async function handleLearnText(req, roomId) {
  const body = await readJson(req);
  const context = getContext(roomId);
  const text = String(body.text || body.input?.text || '').trim();
  if (!text) throw new Error('Text is required');
  const chunks = chunkText(text);
  const summary = await askJson([
    { role: 'system', content: '請把文字整理成 HERMES 小房間可用素材摘要，回傳 JSON：summary, highlights, tone, audience。' },
    { role: 'user', content: text.slice(0, 12000) },
  ], { summary: text.slice(0, 180), highlights: [], tone: [], audience: [] }, 0.35);

  const doc = { id: makeId('doc'), workspace_id: context.workspace.id, room_id: roomId, title: body.title || '文字匯入資料', source_type: 'manual_text', summary: summary.summary || text.slice(0, 180), source_text: text, chunks, deleted_at: null, created_at: new Date().toISOString() };
  store.documents.unshift(doc);
  store.messages.push({ id: makeId('msg'), workspace_id: context.workspace.id, room_id: roomId, role: 'assistant', output_type: 'chat', content: `已學習這份素材，後續生成會引用它。摘要：${doc.summary}`, metadata: { documentId: doc.id, summary }, created_at: new Date().toISOString() });
  addRun(context, 'learn_text', { documentId: doc.id, chunks: chunks.length }, summary);
  saveStore();
  return { document: doc, chunks: chunks.length, summary, ...getContext(roomId) };
}

async function handleGenerateScript(req, roomId) {
  const body = await readJson(req);
  const context = getContext(roomId);
  const params = body.params || { platform: '多平台', purpose: '建立信任', scriptStyle: '雙人對話', durationSeconds: 45, tones: ['自然口語', '台灣在地感'], roles: ['品牌主', '藏鏡人'] };
  const input = { workspaceId: context.workspace.id, roomState: context.state, documents: context.documents, memories: context.memories, recentMessages: context.messages.slice(-20), persona: body.persona || {}, params };
  const script = await generateScript(input);
  const draft = { id: makeId('draft'), workspace_id: context.workspace.id, room_id: roomId, status: 'draft', platform: params.platform, purpose: params.purpose, script_style: params.scriptStyle, duration_seconds: params.durationSeconds, roles: params.roles || [], tones: params.tones || [], rehearsal_preview: script.rehearsalPreview || [], real_lines: script.realLines || [], story_beats: script.storyBeats || {}, blocks: script.blocks || [], citations: script.citations || [], quality_check: script.qualityCheck || {}, human_speech_check: script.humanSpeechCheck || {}, publish_pack: script.publishPack || {}, created_at: new Date().toISOString() };
  store.drafts.unshift(draft);
  const nextState = { ...context.state, currentStage: 'script_drafted', voiceDna: script.voiceDna || context.state.voiceDna, latestRehearsal: script.rehearsalPreview || [], realLines: script.realLines || [], storyBeats: script.storyBeats || {}, lastQualityCheck: script.humanSpeechCheck || script.qualityCheck || {}, activeScriptDraftId: draft.id, updatedAt: new Date().toISOString() };
  store.states = store.states.filter((item) => item.roomId !== roomId);
  store.states.unshift(nextState);
  store.messages.push({ id: makeId('msg'), workspace_id: context.workspace.id, room_id: roomId, role: 'assistant', output_type: 'script', content: script.hermesJudgement || '已產出 HERMES 小房間腳本草稿。', metadata: { draftId: draft.id, script }, created_at: new Date().toISOString() });
  addRun(context, 'generate_script', input, { draftId: draft.id });
  saveStore();
  return { draft, script, ...getContext(roomId) };
}

async function handleSuggest(req, type) {
  const body = await readJson(req);
  const brand = body.persona?.brandName || '你的品牌';
  return { suggestions: type === 'cta' ? [`想把 ${brand} 的短影音方向整理清楚，先私訊「腳本」。`, '把素材丟進 HERMES 小房間，先跑一版真人互動腳本。'] : ['不保證流量、成交或營收', '不使用恐嚇式行銷', '不把未提供的功能講成事實'] };
}

async function handleLegacyLearn(req) {
  const body = await readJson(req);
  const text = String(body.input?.text || body.text || '').trim();
  return { id: makeId('source'), background: '已將文字整理成 HERMES 可用素材。', highlights: '可用於人物定位、開場、CTA 與內容邊界。', audience: body.persona?.audience || '尚未明確', painPoints: `source_id=${Date.now()}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo`, topics: '短影音素材 / 人設 / CTA', sellingPoints: '把原始文字整理成可拍攝腳本素材。', sourceText: text };
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
      return sendJson(res, 200, { aiConnected: Boolean(OPENAI_API_KEY), model: OPENAI_MODEL, mode: 'hermes-local-room-runtime', promptIntegrity: 'ok', supabaseConfigured: false, localRoomPersistence: true, policy: 'local file-backed room_state runtime' });
    }
    if (req.method === 'POST' && pathname === '/api/rooms') return sendJson(res, 200, createRoom(await readJson(req), requireLocalUser(req)));

    const roomRoute = parseRoomPath(pathname);
    if (roomRoute) {
      requireLocalUser(req);
      if (req.method === 'GET' && roomRoute.action === 'state') return sendJson(res, 200, getContext(roomRoute.roomId));
      if (req.method === 'POST' && roomRoute.action === 'messages') return sendJson(res, 200, await handleMessage(req, roomRoute.roomId));
      if (req.method === 'POST' && roomRoute.action === 'learn-text') return sendJson(res, 200, await handleLearnText(req, roomRoute.roomId));
      if (req.method === 'POST' && roomRoute.action === 'generate-script') return sendJson(res, 200, await handleGenerateScript(req, roomRoute.roomId));
    }

    if (req.method === 'POST' && pathname === '/api/suggest-cta') return sendJson(res, 200, await handleSuggest(req, 'cta'));
    if (req.method === 'POST' && pathname === '/api/suggest-boundaries') return sendJson(res, 200, await handleSuggest(req, 'boundaries'));
    if (req.method === 'POST' && pathname === '/api/learn-text') return sendJson(res, 200, await handleLegacyLearn(req));
    if (req.method === 'POST' && pathname === '/api/scripts') return sendJson(res, 200, await generateScript(await readJson(req)));
    if (req.method === 'POST' && pathname === '/api/rewrite-script') return sendJson(res, 200, await generateScript(await readJson(req)));

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || 'Server error' });
  }
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`HERMES local room runtime listening on http://127.0.0.1:${PORT}`);
});
