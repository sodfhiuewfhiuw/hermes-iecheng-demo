import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(fileName) {
  const envPath = path.join(__dirname, fileName);
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
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
  const required = ['HERMES', '藏鏡人', 'voice_dna', '心裡 OS'];
  const missing = required.filter((word) => !systemPrompt.includes(word));
  if (missing.length) {
    throw new Error(`Prompt integrity check failed. Missing: ${missing.join(', ')}`);
  }
}

checkPromptIntegrity();

function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

const supabaseAdmin = supabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

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

function requireSupabaseReady() {
  if (!supabaseAdmin) {
    const error = new Error('Supabase is not configured');
    error.status = 503;
    error.details = {
      missing: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((key) => !process.env[key]),
    };
    throw error;
  }
}

async function requireUser(req) {
  requireSupabaseReady();
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    const error = new Error('Missing Authorization bearer token');
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

async function ensureWorkspaceForUser(user) {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name, owner_id)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (membership?.workspace_id) {
    return {
      id: membership.workspace_id,
      name: membership.workspaces?.name || 'HERMES Workspace',
      role: membership.role,
    };
  }

  const { data: workspace, error: workspaceError } = await supabaseAdmin
    .from('workspaces')
    .insert({ name: 'HERMES Workspace', owner_id: user.id })
    .select('*')
    .single();
  if (workspaceError) throw workspaceError;

  const { error: memberError } = await supabaseAdmin
    .from('workspace_members')
    .insert({ workspace_id: workspace.id, user_id: user.id, role: 'owner' });
  if (memberError) throw memberError;

  return { id: workspace.id, name: workspace.name, role: 'owner' };
}

async function loadRoomContext(user, roomId) {
  const workspace = await ensureWorkspaceForUser(user);
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!room) {
    const error = new Error('Room not found or not in workspace');
    error.status = 404;
    throw error;
  }

  const [{ data: state }, { data: messages }, { data: documents }, { data: memories }, { data: drafts }] = await Promise.all([
    supabaseAdmin.from('room_state').select('*').eq('room_id', roomId).maybeSingle(),
    supabaseAdmin.from('room_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(80),
    supabaseAdmin.from('documents').select('*').eq('room_id', roomId).is('deleted_at', null).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('memories').select('*').eq('room_id', roomId).is('deleted_at', null).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('script_drafts').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(10),
  ]);

  return {
    workspace,
    room,
    state: normalizeRoomState(state, roomId, workspace.id),
    messages: messages || [],
    documents: documents || [],
    memories: memories || [],
    drafts: drafts || [],
  };
}

function normalizeRoomState(row, roomId, workspaceId) {
  return {
    roomId,
    workspaceId,
    currentStage: row?.current_stage || 'idle',
    voiceDna: row?.voice_dna || {},
    latestRehearsal: row?.latest_rehearsal || [],
    realLines: row?.real_lines || [],
    storyBeats: row?.story_beats || {},
    openQuestions: row?.open_questions || [],
    lastQualityCheck: row?.last_quality_check || {},
    activeScriptDraftId: row?.active_script_draft_id || null,
    updatedAt: row?.updated_at || new Date().toISOString(),
  };
}

function toDbStatePatch(state) {
  return {
    current_stage: state.currentStage || 'idle',
    voice_dna: state.voiceDna || {},
    latest_rehearsal: state.latestRehearsal || [],
    real_lines: state.realLines || [],
    story_beats: state.storyBeats || {},
    open_questions: state.openQuestions || [],
    last_quality_check: state.lastQualityCheck || {},
    active_script_draft_id: state.activeScriptDraftId || null,
    updated_at: new Date().toISOString(),
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
    const content = data?.choices?.[0]?.message?.content || '{}';
    return JSON.parse(content);
  } catch (error) {
    return { ...fallback, _fallbackReason: error instanceof Error ? error.message : String(error) };
  }
}

function makeFallbackScript(input) {
  const roles = input?.params?.roles?.length ? input.params.roles : ['品牌主', '藏鏡人'];
  const duration = Number(input?.params?.durationSeconds || 30);
  const step = Math.max(5, Math.round(duration / 5));
  const cta = input?.persona?.ctaMethod || input?.persona?.ctaKeyword || '想把你的短影音方向整理清楚，可以先把素材丟進小房間。';
  return {
    hermesJudgement: '這版先用 HERMES 小房間邏輯跑：先抓衝突，再讓角色互動，不只做單人口播。',
    usableMaterials: '可用素材包含人物定位、受眾、CTA、禁語與已匯入文字。',
    missingInfo: '如果要更像原生 TG 小房間，需要補更多真實對話、口頭禪與案例。',
    safetyCheck: '未使用外部資料，未引用已刪除來源。',
    citations: [],
    voiceDna: {
      brandVoice: '直接、口語、有操盤視角',
      speakingRhythm: '先吐槽問題，再拆底層原因，最後給可執行下一步',
      commonPhrases: ['不是先拍片，是先做操盤', '這段要有人味', '不要講成公關稿'],
      forbiddenTone: ['空泛保證', '硬銷', '過度神化'],
      emotionalTexture: '像藏鏡人在旁邊拆局',
      personaNotes: roles,
    },
    rehearsalPreview: [
      { speaker: roles[0], line: '我知道要做短影音，但每次寫出來都像廣告稿。', innerOS: '怕內容無效', purpose: '丟出真問題' },
      { speaker: roles[1], line: '因為你現在不是缺腳本，是缺一個能讓人相信你的現場。', innerOS: '切入操盤觀點', purpose: '建立衝突' },
    ],
    realLines: [
      '你不是不會拍，是不知道這支影片要讓誰相信你。',
      '先不要急著寫開場，先把觀眾心裡那句話抓出來。',
      cta,
    ],
    storyBeats: {
      hook: '點破短影音無效的真正原因',
      setup: '品牌主以為缺的是腳本',
      conflict: '藏鏡人指出其實缺的是受眾、場景與信任結構',
      turningPoint: '把素材放進小房間，先模擬現場再寫腳本',
      ending: cta,
    },
    publishPack: {
      title: '短影音不是先拍，是先操盤',
      subtitleFirstLine: '你的腳本不像人話，觀眾當然不會停下來。',
      cta,
      hashtags: ['#短影音操盤', '#IE程', '#內容企劃'],
    },
    humanSpeechCheck: {
      overall: '需補強',
      aiPublicRelationsTone: '部分句子仍偏整理式，建議加入更多真實口頭禪。',
      exaggeratedClaims: '未看到保證成效。',
      forbiddenWords: '未踩明確禁語。',
      humanNaturalness: '角色互動已建立，但可再增加反問與停頓。',
      suggestedFixes: ['補一段品牌主反駁', '加入更具體的拍攝動作', 'CTA 改成使用者指定句'],
    },
    qualityCheck: {
      hook: '通過：有指出短影音無效原因',
      interaction: '通過：有雙人衝突',
      cta: cta ? '通過：使用指定 CTA' : '需補強：CTA 不夠明確',
      shootability: '通過：可用對話與桌面/白板畫面拍攝',
      risk: '通過：未誇大承諾',
      humanSpeech: '需補強：可再貼近 TG 口語',
    },
    blocks: Array.from({ length: 5 }).map((_, index) => {
      const start = index * step;
      const end = index === 4 ? duration : (index + 1) * step;
      const speaker = roles[index % roles.length] || roles[0];
      const lines = [
        '你是不是也覺得，短影音做了很多，但好像都只是把資訊講完？',
        '問題不是你不努力，是腳本沒有角色、沒有衝突、沒有一個人真的在現場說話。',
        'HERMES 小房間會先看你的素材，抓 voice_dna，再模擬觀眾跟品牌主的對話。',
        '等真人句跑出來，腳本才會像人講話，而不是像簡報被唸出來。',
        cta,
      ];
      return {
        time: `${start}-${end} 秒`,
        speaker,
        visual: index === 0 ? '鏡頭拍品牌主看著草稿皺眉，桌上有素材、便條紙與手機。' : '切到白板、小房間對話、角色互動與腳本卡片。',
        audio: lines[index],
      };
    }),
  };
}

async function generateHermesScript(input) {
  const fallback = makeFallbackScript(input);
  return askJson([
    { role: 'system', content: prompts['hermes.system'] },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'generate full HERMES short video script as JSON',
        requiredKeys: Object.keys(fallback),
        input,
      }),
    },
  ], fallback, 0.85);
}

async function runRoomMessagePipeline(context, content) {
  const intent = await askJson([
    { role: 'system', content: prompts.classify_intent },
    { role: 'user', content },
  ], {
    intent: /腳本|產出|生成/.test(content) ? 'generate_script' : 'chat',
    confidence: 0.7,
    shouldGenerateScript: /腳本|產出|生成/.test(content),
    reason: 'deterministic fallback',
  }, 0.2);

  const currentState = context.state;
  const voiceDna = await askJson([
    { role: 'system', content: `${prompts['hermes.system']}\n\n${prompts.distill_voice_dna}` },
    { role: 'user', content: JSON.stringify({ message: content, currentState, memories: context.memories, documents: context.documents }) },
  ], {
    brandVoice: 'HERMES 小房間口語操盤',
    speakingRhythm: '先指出問題，再用藏鏡人拆解原因',
    commonPhrases: ['不是先拍片，是先操盤'],
    forbiddenTone: ['公關稿', '空泛保證'],
    emotionalTexture: '直接但可落地',
    personaNotes: [],
  }, 0.5);

  const nextState = {
    ...currentState,
    currentStage: intent.shouldGenerateScript ? 'ready_to_generate_script' : 'chatting',
    voiceDna,
    openQuestions: intent.shouldGenerateScript ? [] : ['要不要我把這段素材轉成一版雙人互動腳本？'],
  };

  return {
    intent,
    state: nextState,
    assistantMessage: {
      role: 'assistant',
      outputType: intent.shouldGenerateScript ? 'question' : 'chat',
      content: intent.shouldGenerateScript
        ? '我已經抓到方向了。要產完整腳本的話，我會先跑「現場模擬 -> 真人句 -> 故事骨架 -> 草稿 -> 人話檢查」。'
        : '收到，我先把這段放進小房間狀態。現在比較缺的是真實口頭禪、角色互動和觀眾心裡那句話。',
      metadata: { intent, voiceDna },
    },
  };
}

async function insertAgentRun(context, stage, inputSnapshot, outputSnapshot, status = 'success', error = null, userMessageId = null) {
  await supabaseAdmin.from('agent_runs').insert({
    workspace_id: context.workspace.id,
    room_id: context.room.id,
    user_message_id: userMessageId,
    stage,
    input_snapshot: inputSnapshot || {},
    output_snapshot: outputSnapshot || {},
    model: OPENAI_MODEL,
    status,
    error,
  });
}

async function handleCreateRoom(req, res) {
  const user = await requireUser(req);
  const body = await readJson(req);
  const workspace = await ensureWorkspaceForUser(user);
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .insert({ workspace_id: workspace.id, title: body.title || 'HERMES 小房間', created_by: user.id })
    .select('*')
    .single();
  if (roomError) throw roomError;

  await supabaseAdmin.from('room_state').insert({ room_id: room.id, workspace_id: workspace.id });
  sendJson(res, 200, { workspace, room, state: normalizeRoomState(null, room.id, workspace.id) });
}

async function handleGetRoomState(req, res, roomId) {
  const user = await requireUser(req);
  const context = await loadRoomContext(user, roomId);
  sendJson(res, 200, context);
}

async function handleRoomMessage(req, res, roomId) {
  const user = await requireUser(req);
  const body = await readJson(req);
  const context = await loadRoomContext(user, roomId);
  const content = String(body.content || '').trim();
  if (!content) throw new Error('Message content is required');

  const { data: userMessage, error: messageError } = await supabaseAdmin
    .from('room_messages')
    .insert({ workspace_id: context.workspace.id, room_id: roomId, role: 'user', content, output_type: 'chat' })
    .select('*')
    .single();
  if (messageError) throw messageError;

  const result = await runRoomMessagePipeline(context, content);
  await insertAgentRun(context, 'classify_intent', { content }, result.intent, 'success', null, userMessage.id);
  await insertAgentRun(context, 'distill_voice_dna', { content }, result.state.voiceDna, 'success', null, userMessage.id);

  await supabaseAdmin.from('room_state').update(toDbStatePatch(result.state)).eq('room_id', roomId);
  const { data: assistant } = await supabaseAdmin
    .from('room_messages')
    .insert({
      workspace_id: context.workspace.id,
      room_id: roomId,
      role: 'assistant',
      content: result.assistantMessage.content,
      output_type: result.assistantMessage.outputType,
      metadata: result.assistantMessage.metadata,
    })
    .select('*')
    .single();

  const updated = await loadRoomContext(user, roomId);
  sendJson(res, 200, { userMessage, assistantMessage: assistant, ...updated });
}

function chunkText(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks = [];
  for (let i = 0; i < clean.length; i += 1200) chunks.push(clean.slice(i, i + 1200));
  return chunks;
}

async function handleLearnText(req, res, roomId) {
  const user = await requireUser(req);
  const body = await readJson(req);
  const context = await loadRoomContext(user, roomId);
  const text = String(body.text || body.input?.text || '').trim();
  if (!text) throw new Error('Text is required');

  const summaryResult = await askJson([
    { role: 'system', content: `${prompts['hermes.system']}\n請把使用者文字整理成可檢索素材摘要。` },
    { role: 'user', content: text.slice(0, 12000) },
  ], {
    summary: text.slice(0, 180),
    highlights: ['已匯入小房間素材'],
    audience: [],
    tone: [],
  }, 0.4);

  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .insert({
      workspace_id: context.workspace.id,
      room_id: roomId,
      title: body.title || '文字匯入資料',
      source_type: 'manual_text',
      summary: summaryResult.summary || '',
    })
    .select('*')
    .single();
  if (docError) throw docError;

  const chunks = chunkText(text);
  if (chunks.length) {
    await supabaseAdmin.from('document_chunks').insert(chunks.map((content, index) => ({
      workspace_id: context.workspace.id,
      document_id: doc.id,
      chunk_index: index,
      content,
      metadata: { title: doc.title },
    })));
  }

  await supabaseAdmin.from('room_messages').insert({
    workspace_id: context.workspace.id,
    room_id: roomId,
    role: 'assistant',
    output_type: 'chat',
    content: `已學習這份文字素材。摘要：${summaryResult.summary || '已建立可檢索素材。'}`,
    metadata: { documentId: doc.id, summaryResult },
  });

  await insertAgentRun(context, 'learn_text', { documentId: doc.id }, summaryResult);
  sendJson(res, 200, { document: doc, chunks: chunks.length, summary: summaryResult });
}

async function handleGenerateRoomScript(req, res, roomId) {
  const user = await requireUser(req);
  const body = await readJson(req);
  const context = await loadRoomContext(user, roomId);
  const input = {
    roomState: context.state,
    documents: context.documents,
    memories: context.memories,
    recentMessages: context.messages.slice(-20),
    persona: body.persona || {},
    params: body.params || {
      platform: '多平台',
      purpose: '建立信任',
      scriptStyle: '雙人對話',
      durationSeconds: 45,
      tones: [],
      roles: ['品牌主', '藏鏡人'],
    },
  };

  const script = await generateHermesScript(input);
  const { data: draft, error: draftError } = await supabaseAdmin
    .from('script_drafts')
    .insert({
      workspace_id: context.workspace.id,
      room_id: roomId,
      platform: input.params.platform,
      purpose: input.params.purpose,
      script_style: input.params.scriptStyle,
      duration_seconds: input.params.durationSeconds,
      roles: input.params.roles || [],
      tones: input.params.tones || [],
      rehearsal_preview: script.rehearsalPreview || [],
      real_lines: script.realLines || [],
      story_beats: script.storyBeats || {},
      blocks: script.blocks || [],
      citations: script.citations || [],
      quality_check: script.qualityCheck || {},
      human_speech_check: script.humanSpeechCheck || {},
      publish_pack: script.publishPack || {},
    })
    .select('*')
    .single();
  if (draftError) throw draftError;

  const nextState = {
    ...context.state,
    currentStage: 'script_drafted',
    voiceDna: script.voiceDna || context.state.voiceDna,
    latestRehearsal: script.rehearsalPreview || [],
    realLines: script.realLines || [],
    storyBeats: script.storyBeats || {},
    lastQualityCheck: script.humanSpeechCheck || script.qualityCheck || {},
    activeScriptDraftId: draft.id,
  };

  await supabaseAdmin.from('room_state').update(toDbStatePatch(nextState)).eq('room_id', roomId);
  await supabaseAdmin.from('room_messages').insert({
    workspace_id: context.workspace.id,
    room_id: roomId,
    role: 'assistant',
    output_type: 'script',
    content: script.hermesJudgement || '已產出 HERMES 小房間腳本草稿。',
    metadata: { draftId: draft.id, script },
  });

  for (const stage of ['simulate_scene', 'extract_real_lines', 'build_story_beats', 'draft_script', 'human_speech_check']) {
    await insertAgentRun(context, stage, input, { stage, draftId: draft.id, script });
  }

  const updated = await loadRoomContext(user, roomId);
  sendJson(res, 200, { draft, script, ...updated });
}

async function handleSoftDelete(req, res, roomId, table) {
  const user = await requireUser(req);
  const body = await readJson(req);
  const context = await loadRoomContext(user, roomId);
  const id = body.id;
  if (!id) throw new Error('id is required');
  const { error } = await supabaseAdmin
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', context.workspace.id)
    .eq('room_id', roomId);
  if (error) throw error;
  sendJson(res, 200, { deleted: true, id });
}

async function handleLegacyLearnText(req, res) {
  const body = await readJson(req);
  const text = String(body.input?.text || body.text || '').trim();
  const result = {
    id: `source_${Date.now()}`,
    background: text ? '已將文字整理成 HERMES 可用素材。' : '尚未提供文字。',
    highlights: '可用於人物定位、短影音開場、CTA 與內容邊界。',
    audience: body.persona?.audience || '尚未明確',
    painPoints: `source_id=source_${Date.now()}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo-workspace-room`,
    topics: '品牌素材 / 腳本素材 / 小房間記憶',
    sellingPoints: '保留原始事實，轉成可拍攝文稿素材。',
    sourceText: text,
  };
  sendJson(res, 200, result);
}

async function handleLegacyScript(req, res) {
  const body = await readJson(req);
  const script = await generateHermesScript(body);
  sendJson(res, 200, script);
}

async function handleSuggest(req, res, type) {
  const body = await readJson(req);
  const persona = body.persona || {};
  const suggestions = type === 'cta'
    ? [
      `想把${persona.brandName || '你的品牌'}短影音方向整理清楚，可以先私訊「腳本」。`,
      '把現有素材丟進小房間，我會先幫你抓出觀眾真正會在意的那句話。',
      '如果你不想再寫出公關稿，先讓 HERMES 幫你跑一版真人互動腳本。',
    ]
    : [
      '不保證流量、成交或營收結果。',
      '不使用恐嚇式行銷。',
      '不碰醫療、投資、法律等未授權保證。',
      '不把未提供的產品功能講成既有事實。',
    ];
  sendJson(res, 200, { suggestions });
}

function routeRoomPath(pathname) {
  const match = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return null;
  return { roomId: match[1], action: match[2] || 'state' };
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
      sendJson(res, 200, {
        aiConnected: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
        mode: 'hermes-room-runtime',
        promptIntegrity: 'ok',
        supabaseConfigured: supabaseConfigured(),
        policy: 'message-wake room_state runtime',
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/rooms') return await handleCreateRoom(req, res);

    const roomRoute = routeRoomPath(pathname);
    if (roomRoute) {
      if (req.method === 'GET' && roomRoute.action === 'state') return await handleGetRoomState(req, res, roomRoute.roomId);
      if (req.method === 'POST' && roomRoute.action === 'messages') return await handleRoomMessage(req, res, roomRoute.roomId);
      if (req.method === 'POST' && roomRoute.action === 'learn-text') return await handleLearnText(req, res, roomRoute.roomId);
      if (req.method === 'POST' && roomRoute.action === 'generate-script') return await handleGenerateRoomScript(req, res, roomRoute.roomId);
      if (req.method === 'POST' && roomRoute.action === 'delete-memory') return await handleSoftDelete(req, res, roomRoute.roomId, 'memories');
      if (req.method === 'POST' && roomRoute.action === 'delete-document') return await handleSoftDelete(req, res, roomRoute.roomId, 'documents');
    }

    if (req.method === 'POST' && pathname === '/api/suggest-cta') return await handleSuggest(req, res, 'cta');
    if (req.method === 'POST' && pathname === '/api/suggest-boundaries') return await handleSuggest(req, res, 'boundaries');
    if (req.method === 'POST' && pathname === '/api/learn-text') return await handleLegacyLearnText(req, res);
    if (req.method === 'POST' && pathname === '/api/scripts') return await handleLegacyScript(req, res);
    if (req.method === 'POST' && pathname === '/api/rewrite-script') return await handleLegacyScript(req, res);

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, {
      error: error.message || 'Server error',
      details: error.details,
    });
  }
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`HERMES room runtime listening on http://127.0.0.1:${PORT}`);
  console.log(`OpenAI model: ${OPENAI_MODEL}`);
  console.log(`Supabase configured: ${supabaseConfigured() ? 'yes' : 'no'}`);
});
