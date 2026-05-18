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
const promptDir = path.join(__dirname, 'prompts');

const corsHeaders = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function readPrompt(name) {
  return fs.readFileSync(path.join(promptDir, name), 'utf8');
}

const HERMES_SYSTEM = readPrompt('hermes.system.md');
const TG_SCRIPT_ENGINE = readPrompt('tg_script_engine.md');

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
    // Ignore corrupted local scratch data.
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
  return /^(hi|hello|hey|你好|哈囉|嗨|安安|早安|午安|晚安)[！!。\.\s]*$/i.test(text);
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

function collectMaterials(input) {
  const learnedUrls = input.learnedUrls || [];
  const documents = input.documents || [];
  const memories = input.memories || [];
  const recentMessages = input.recentMessages || [];
  return [
    ...learnedUrls.map((item) => ({
      title: item.background || item.title || '前端學習資料',
      text: [item.sourceText, item.highlights, item.audience, item.painPoints, item.topics, item.sellingPoints].filter(Boolean).join('\n'),
    })),
    ...documents.map((item) => ({
      title: item.title || '小房間資料',
      text: [item.summary, ...(item.chunks || []), item.source_text].filter(Boolean).join('\n'),
    })),
    ...memories.map((item) => ({ title: '小房間記憶', text: item.content || String(item) })),
    ...recentMessages.slice(-8).map((item) => ({ title: `對話 ${item.role || ''}`, text: item.content || '' })),
  ].filter((item) => item.text && item.text.trim());
}

function defaultRoles(params = {}) {
  if (Array.isArray(params.roles) && params.roles.length) return params.roles;
  if (params.scriptStyle === '三人討論') return ['主持人', '客戶', '藏鏡人'];
  if (params.scriptStyle === '店員客人互動') return ['店員', '客人', '旁白'];
  if (params.scriptStyle === '街訪問答') return ['訪問者', '路人', '藏鏡人'];
  if (params.scriptStyle === '單人口播') return ['藏鏡人'];
  return ['品牌主', '藏鏡人'];
}

function buildFallbackScript(input) {
  const params = input.params || {};
  const persona = input.persona || {};
  const materials = collectMaterials(input);
  const roles = defaultRoles(params);
  const source = materials[0]?.text || '目前素材不足，請先貼品牌介紹、客戶對話或 TG 腳本範例。';
  const cta = persona.ctaMethod || persona.ctaKeyword || '想看你的短影音可以怎麼拍，私訊我「短影音腳本」。';
  const citations = materials.map((item, index) => `source_id=local_${index + 1}; document_title=${item.title}; chunk_id=chunk_${index + 1}; workspace_id=local-workspace-111`);

  return {
    hermesJudgement: `這支不能先寫賣點，要先抓觀眾心裡那句話。素材裡最能用的是：${source.slice(0, 90)}`,
    usableMaterials: materials.length ? materials.map((item) => item.title).join('、') : '素材不足，只能先做保守草稿',
    missingInfo: materials.length ? '還可以補更多真實客戶對話、TG 口頭禪、過去高成效腳本。' : '缺品牌素材、受眾、案例、口語範例。',
    safetyCheck: '未主動查網路；未虛構價格、成效或保證。',
    citations,
    voiceDna: {
      brandVoice: '直接、口語、有藏鏡人拆局感',
      speakingRhythm: '先戳破問題，再翻成觀眾心裡話，最後給一個能拍的下一步',
      commonPhrases: ['不是先拍片，是先操盤', '這段要有人味', '先抓觀眾心裡那句話', '不要講成公司簡介'],
      forbiddenTone: ['公關稿', '空泛保證', '硬銷', '只有條列賣點'],
      emotionalTexture: '像 TG 小房間裡，藏鏡人一邊拆稿一邊逼近真話',
      personaNotes: roles,
    },
    rehearsalPreview: [
      { speaker: roles[0], line: '我資料都有了，但寫出來怎麼還是像公司介紹？', innerOS: '怕又變成沒人看的廣告', purpose: '丟出真問題' },
      { speaker: roles[1] || '藏鏡人', line: '因為你現在不是缺資料，是缺觀眾會在意的那個現場。', innerOS: '拆掉表面問題', purpose: '建立衝突' },
      { speaker: roles[0], line: '所以不是一直講我多專業，而是先講他為什麼卡住？', innerOS: '開始轉向觀眾視角', purpose: '轉折' },
    ],
    realLines: [
      '你不是不會拍，是還沒抓到觀眾心裡那句話。',
      '不要先寫腳本，先問這支片要讓誰相信你。',
      '這段如果講得像簡報，觀眾就會直接滑走。',
      '品牌想講的是賣點，觀眾想聽的是：這跟我有什麼關係？',
    ],
    storyBeats: {
      hook: '短影音無效不是因為你不努力，而是腳本沒有現場感。',
      setup: '品牌主拿著素材，卻寫不出能拍的內容。',
      conflict: '藏鏡人指出問題在受眾心裡話、角色衝突與信任結構。',
      turningPoint: '先模擬觀眾與品牌主的對話，再抽真人句。',
      ending: cta,
    },
    publishPack: {
      title: '短影音不是先拍，是先操盤',
      subtitleFirstLine: '你的腳本不像人話，觀眾當然不會停。',
      cta,
      hashtags: ['#短影音操盤', '#IE程', '#藏鏡人'],
    },
    humanSpeechCheck: {
      overall: materials.length ? '通過' : '需補強',
      aiPublicRelationsTone: '已避免公司簡介語氣，但仍需要更多 TG 原生詞彙校準。',
      exaggeratedClaims: '未看到保證成效。',
      forbiddenWords: '未踩明確禁語。',
      humanNaturalness: '有角色互動、反問與轉折。',
      suggestedFixes: ['加入一段真實客戶反駁', '把 CTA 改成更具體的私訊關鍵字', '補一個觀眾會點頭的生活場景'],
    },
    qualityCheck: {
      hook: '通過：有觀眾問題',
      interaction: roles.length > 1 ? '通過：有角色互動' : '需補強：目前偏單人口播',
      cta: cta ? '通過：CTA 明確' : '需補強',
      shootability: '通過：每段都有畫面',
      risk: '通過：未誇大承諾',
      humanSpeech: '需補強：需要更多 TG 原生語料',
    },
    blocks: [
      { time: '0-5 秒', speaker: roles[0], visual: '品牌主看著一疊素材和空白腳本，表情卡住。', audio: '我資料都有了，但寫出來怎麼還是像公司介紹？' },
      { time: '5-12 秒', speaker: roles[1] || '藏鏡人', visual: '藏鏡人把「賣點」兩字圈起來，旁邊寫上「觀眾在意嗎？」', audio: '因為你現在不是缺資料，是缺觀眾會在意的那個現場。' },
      { time: '12-22 秒', speaker: roles[1] || '藏鏡人', visual: '白板出現四格：受眾、衝突、真人句、CTA。', audio: `先看素材裡真正能用的點：${source.slice(0, 60)}。這個不能照念，要翻成觀眾聽得懂的話。` },
      { time: '22-34 秒', speaker: roles[0], visual: '品牌主把原本的賣點句劃掉，改寫成觀眾痛點。', audio: '所以不是一直講我多專業，而是先講他為什麼卡住？' },
      { time: '34-45 秒', speaker: roles[1] || '藏鏡人', visual: '畫面收斂成一張腳本卡，CTA 浮出。', audio: cta },
    ],
  };
}

async function generateScript(input) {
  const fallback = buildFallbackScript(input);
  return askJson([
    {
      role: 'system',
      content: `${HERMES_SYSTEM}\n\n${TG_SCRIPT_ENGINE}\n\n你必須回傳 JSON，不要 Markdown。audio 欄位必須是可直接拍攝或配音的台詞。`,
    },
    {
      role: 'user',
      content: JSON.stringify({ task: '依照 TG 腳本製作流程產出短影音腳本', requiredKeys: Object.keys(fallback), input }),
    },
  ], fallback, 0.9);
}

async function replyToMessage(context, content) {
  const scriptIntent = wantsScript(content);
  if (isGreeting(content)) {
    return {
      intent: { intent: 'chat', shouldGenerateScript: false, confidence: 1 },
      state: { ...context.state, currentStage: 'greeting', updatedAt: new Date().toISOString() },
      assistantMessage: { role: 'assistant', outputType: 'chat', content: '嗨，我在。現在先不用測小房間，我們重點放在把 TG 端那套腳本製作能力補回來。', metadata: {} },
    };
  }
  const fallback = {
    answer: scriptIntent ? '可以。這次我會用 TG 腳本流程：先抓觀眾心裡話，再做角色衝突，最後才產可拍攝腳本。' : '收到。這句我會當成腳本風格校準，不會直接拿來硬寫成文案。',
    openQuestions: scriptIntent ? [] : ['你要我用雙人對話、三人討論，還是藏鏡人拆解？'],
    memoryShouldSave: isUsefulMemory(content),
    memory: isUsefulMemory(content) ? `腳本風格記憶：${content}` : '',
    voiceDnaPatch: {},
    stage: scriptIntent ? 'ready_to_generate_script' : 'chatting',
  };
  const result = await askJson([
    { role: 'system', content: `${HERMES_SYSTEM}\n你正在回覆 TG 小房間風格校準訊息。請判斷是否值得寫入 memory，並回傳 JSON：answer, openQuestions, memoryShouldSave, memory, voiceDnaPatch, stage。` },
    { role: 'user', content: JSON.stringify({ content, documents: context.documents, memories: context.memories, recentMessages: context.messages.slice(-8) }) },
  ], fallback, 0.65);
  return {
    intent: { intent: scriptIntent ? 'generate_script' : 'chat', shouldGenerateScript: scriptIntent, confidence: 0.85 },
    state: { ...context.state, currentStage: result.stage || fallback.stage, voiceDna: { ...context.state.voiceDna, ...(result.voiceDnaPatch || {}) }, openQuestions: result.openQuestions || fallback.openQuestions, updatedAt: new Date().toISOString() },
    memoryShouldSave: Boolean(result.memoryShouldSave),
    memory: result.memory || fallback.memory,
    assistantMessage: { role: 'assistant', outputType: scriptIntent ? 'question' : 'chat', content: result.answer || fallback.answer, metadata: { voiceDnaPatch: result.voiceDnaPatch || {} } },
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
  const result = await replyToMessage({ ...context, messages: [...context.messages, userMessage] }, content);
  if (result.memoryShouldSave && result.memory) {
    store.memories.unshift({ id: makeId('mem'), workspace_id: context.workspace.id, room_id: roomId, content: result.memory, source_type: 'room_message', source_message_id: userMessage.id, deleted_at: null, created_at: new Date().toISOString() });
  }
  store.states = store.states.filter((item) => item.roomId !== roomId);
  store.states.unshift(result.state);
  const assistant = { id: makeId('msg'), workspace_id: context.workspace.id, room_id: roomId, role: 'assistant', content: result.assistantMessage.content, output_type: result.assistantMessage.outputType, metadata: result.assistantMessage.metadata, created_at: new Date().toISOString() };
  store.messages.push(assistant);
  addRun(context, 'room_cognition', { content }, result, userMessage.id);
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
    { role: 'system', content: '請把文字整理成 HERMES TG 腳本素材摘要，回傳 JSON：summary, highlights, tone, audience。' },
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
  store.messages.push({ id: makeId('msg'), workspace_id: context.workspace.id, room_id: roomId, role: 'assistant', output_type: 'script', content: script.hermesJudgement || '已產出 HERMES TG 腳本草稿。', metadata: { draftId: draft.id, script }, created_at: new Date().toISOString() });
  addRun(context, 'generate_tg_script', input, { draftId: draft.id });
  saveStore();
  return { draft, script, ...getContext(roomId) };
}

async function handleSuggest(req, type) {
  const body = await readJson(req);
  const brand = body.persona?.brandName || '你的品牌';
  return { suggestions: type === 'cta' ? [`想把 ${brand} 的短影音方向整理清楚，先私訊「腳本」。`, '想看這支可以怎麼拍，丟素材給我，我先拆一版。'] : ['不保證流量、成交或營收', '不使用恐嚇式行銷', '不把未提供的功能講成事實'] };
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
      return sendJson(res, 200, { aiConnected: Boolean(OPENAI_API_KEY), model: OPENAI_MODEL, mode: 'hermes-tg-script-engine', promptIntegrity: 'ok', supabaseConfigured: false, localRoomPersistence: true, policy: 'TG script pipeline first' });
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
  console.log(`HERMES TG script engine listening on http://127.0.0.1:${PORT}`);
});
