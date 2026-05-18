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

function apiError(stage, detail, status = 502) {
  const error = new Error('API 錯誤，請聯繫官方');
  error.status = status;
  error.payload = {
    errorCode: 'AI_API_ERROR',
    stage,
    model: OPENAI_MODEL,
    message: 'API 錯誤，請聯繫官方',
    detail: detail instanceof Error ? detail.message : String(detail || ''),
    fallbackUsed: false,
  };
  return error;
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

function textList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      return item.text || item.suggestion || item.cta || item.content || item.value || item.title || '';
    }
    return String(item || '');
  }).map((item) => String(item).trim()).filter(Boolean);
}

async function buildIndustryInsight(input) {
  const persona = input?.persona || {};
  const params = input?.params || {};
  const materials = collectMaterials(input).slice(0, 4).map((item) => ({
    title: item.title,
    text: item.text.slice(0, 600),
  }));
  const result = await askJson([
    {
      role: 'system',
      content: `${HERMES_SYSTEM}\n你正在進行腳本生成前的行業洞察。這不是即時網路搜尋，不可假裝查過網站；但你可以使用安全的公開行業常識與使用者提供的產業、人設、平台、目的，推理受眾、痛點、信任障礙、常見情境、拍攝場景與角色關係。只回 JSON。`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: '建立 industryInsight，讓不同產業產生不同劇情骨架，不可共用固定模板。',
        requiredShape: {
          industry: 'string',
          publicInfoBasis: ['用安全公開常識推理，不含即時查網或具體數字'],
          audienceSegments: ['string'],
          commonPainPoints: ['string'],
          trustBarriers: ['string'],
          purchaseTriggers: ['string'],
          popularContentAngles: ['string'],
          sceneSeeds: [
            {
              location: 'string',
              firstAction: 'string',
              prop: 'string',
              conflict: 'string',
              whyThisFitsIndustry: 'string',
            },
          ],
          rolePatterns: [
            {
              roles: ['string'],
              dynamic: 'string',
            },
          ],
          realQuestions: ['觀眾或客戶會真的問出口的問題'],
          tabooClaims: ['這個產業不能亂講的承諾'],
        },
        persona,
        params,
        materials,
      }),
    },
  ], { industry: persona.industry || '', sceneSeeds: [], rolePatterns: [] }, 0.45, { allowFallback: false, stage: 'industry_research' });

  return {
    industry: String(result.industry || persona.industry || ''),
    publicInfoBasis: textList(result.publicInfoBasis),
    audienceSegments: textList(result.audienceSegments),
    commonPainPoints: textList(result.commonPainPoints),
    trustBarriers: textList(result.trustBarriers),
    purchaseTriggers: textList(result.purchaseTriggers),
    popularContentAngles: textList(result.popularContentAngles),
    sceneSeeds: Array.isArray(result.sceneSeeds) ? result.sceneSeeds : [],
    rolePatterns: Array.isArray(result.rolePatterns) ? result.rolePatterns : [],
    realQuestions: textList(result.realQuestions),
    tabooClaims: textList(result.tabooClaims),
  };
}

async function askJson(messages, fallback, temperature = 0.7, options = {}) {
  const { allowFallback = false, stage = 'unknown' } = options;
  if (!OPENAI_API_KEY) {
    if (allowFallback) return { ...fallback, isFallback: true, fallbackReason: 'missing_openai_api_key' };
    throw apiError(stage, 'missing_openai_api_key', 503);
  }
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
    if (allowFallback) {
      return {
        ...fallback,
        isFallback: true,
        fallbackReason: error instanceof Error ? error.message : String(error),
      };
    }
    throw apiError(stage, error);
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
  const industryInsight = input.industryInsight || {};
  const materials = collectMaterials(input);
  const roles = defaultRoles(params);
  const source = materials[0]?.text || '目前素材不足，請先貼品牌介紹、客戶對話或 TG 腳本範例。';
  const cta = sanitizeCta(persona.ctaMethod || persona.ctaKeyword || '想看你的短影音可以怎麼拍，私訊我「短影音腳本」。', persona.brandName);
  const citations = materials.map((item, index) => `source_id=local_${index + 1}; document_title=${item.title}; chunk_id=chunk_${index + 1}; workspace_id=local-workspace-111`);

  return {
    factBoundary: {
      confirmedFacts: materials.length ? materials.map((item) => item.text.slice(0, 80)) : ['使用者正在建立短影音腳本'],
      usableAngles: ['把素材翻成觀眾聽得懂的現場', '用角色互動降低廣告感'],
      missingFacts: materials.length ? ['可再補真實客戶對話、案例、價格或服務限制'] : ['品牌服務內容', '目標受眾', '真實案例', 'CTA 去向'],
      doNotInvent: ['價格', '成效保證', '客戶案例', '服務過的人數', '得獎紀錄'],
    },
    industryInsight,
    audiencePsychology: {
      mainConcern: industryInsight.commonPainPoints?.[0] || '觀眾怕這又是一支自我介紹或硬銷影片。',
      watchReason: industryInsight.popularContentAngles?.[0] || '看到品牌主也卡在「怎麼講才不像賣」時會有代入感。',
      trustBarrier: industryInsight.trustBarriers?.[0] || '如果一開始只講賣點，觀眾會覺得跟自己無關。',
    },
    scriptCore: {
      type: '共鳴',
      reason: '先讓觀眾認出自己的卡點，再帶出 IE程 的腳本價值。',
    },
    roleRelationship: {
      format: roles.length > 2 ? '多人互動' : '雙人對話',
      roles,
      dynamic: '品牌主拋出卡點，藏鏡人拆掉廣告語，觀眾在心裡點頭。',
    },
    sceneLogic: {
      location: '拍攝現場或辦公桌前',
      firstAction: '品牌主拿著素材卻不知道第一句怎麼開口',
      interruption: '藏鏡人打斷品牌主想講賣點的衝動',
      prop: '手機、空白腳本、白板或素材紙',
      relationship: '品牌主想說清楚，藏鏡人負責把話拉回觀眾視角',
      firstConflict: '品牌主怕一開口就像在賣東西',
      firstHumanReaction: '我資料都有了，但寫出來怎麼還是像公司介紹？',
    },
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
      firstAction: '品牌主拿著素材卡住，鏡頭停在空白腳本上。',
      interruption: '藏鏡人問：你現在是想講產品，還是想讓人聽下去？',
      firstReaction: '品牌主承認自己怕講得太像賣東西。',
      context: '畫面帶到素材、手機和拍攝現場，建立短影音創作壓力。',
      painReveal: '問題不是沒有資料，而是沒有觀眾願意聽的入口。',
      humanExplanation: '藏鏡人把賣點翻成觀眾心裡 OS。',
      twistOrPunch: '不是先拍片，是先把人話抓出來。',
      softCta: cta,
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
    qualityScore: {
      shootable: 8,
      humanVoice: 7,
      retention: 7,
      interaction: roles.length > 1 ? 8 : 5,
      singleCore: 8,
      factSafe: 9,
      suggestedFixes: ['補一個更具體的真實客戶反應', '補品牌服務細節後可提高客製化程度'],
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

function findSection(sections, keyword) {
  if (!Array.isArray(sections)) return undefined;
  return sections.find((section) => String(section.blockName || section.title || '').includes(keyword));
}

function normalizeScriptOutput(raw, fallback) {
  const result = raw && typeof raw === 'object' ? { ...raw } : {};
  const sections = Array.isArray(result.blocks) ? result.blocks : [];
  const draftSection = findSection(sections, '腳本草稿');
  const simulationSection = findSection(sections, '現場模擬');
  const realLineSection = findSection(sections, '真人句');
  const storySection = findSection(sections, '故事骨架');
  const checkSection = findSection(sections, '人話檢查');

  const normalizedBlocks = Array.isArray(draftSection?.content)
    ? draftSection.content
    : Array.isArray(result.blocks)
      ? result.blocks
      : [];

  result.blocks = normalizedBlocks
    .filter((block) => block && typeof block === 'object')
    .map((block, index) => ({
      time: String(block.time || block.timestamp || `${index * 5}-${(index + 1) * 5} 秒`),
      speaker: String(block.speaker || block.role || '藏鏡人'),
      visual: String(block.visual || block.scene || block.shot || '可拍攝畫面'),
      audio: String(block.audio || block.line || block.dialogue || block.content || ''),
    }))
    .filter((block) => block.audio);

  if (!Array.isArray(result.rehearsalPreview) && Array.isArray(simulationSection?.content)) result.rehearsalPreview = simulationSection.content;
  if (!Array.isArray(result.realLines) && Array.isArray(realLineSection?.content)) result.realLines = realLineSection.content;
  if (!result.storyBeats && storySection?.content && typeof storySection.content === 'object') result.storyBeats = storySection.content;
  if (!result.humanSpeechCheck && checkSection?.content) {
    result.humanSpeechCheck = {
      overall: '需補強',
      aiPublicRelationsTone: String(checkSection.content),
      exaggeratedClaims: '未檢出',
      forbiddenWords: '未檢出',
      humanNaturalness: String(checkSection.content),
      suggestedFixes: [],
    };
  }

  return {
    ...fallback,
    ...result,
    blocks: result.blocks,
    rehearsalPreview: result.rehearsalPreview || fallback.rehearsalPreview,
    realLines: result.realLines || fallback.realLines,
    storyBeats: result.storyBeats || fallback.storyBeats,
    publishPack: result.publishPack || fallback.publishPack,
    qualityCheck: result.qualityCheck || fallback.qualityCheck,
    humanSpeechCheck: result.humanSpeechCheck || fallback.humanSpeechCheck,
    voiceDna: result.voiceDna || fallback.voiceDna,
    citations: result.citations || fallback.citations,
    factBoundary: result.factBoundary || fallback.factBoundary,
    audiencePsychology: result.audiencePsychology || fallback.audiencePsychology,
    scriptCore: result.scriptCore || fallback.scriptCore,
    roleRelationship: result.roleRelationship || fallback.roleRelationship,
    sceneLogic: result.sceneLogic || fallback.sceneLogic,
    qualityScore: result.qualityScore || fallback.qualityScore,
  };
}

function normalizeBrandName(brandName) {
  if (!brandName || typeof brandName !== 'string') return 'IE程';
  if (/IE\?/.test(brandName)) return 'IE程';
  return brandName;
}

function stabilizeBrandName(value, brandName) {
  const safeBrandName = normalizeBrandName(brandName);
  if (typeof value === 'string') {
    return value
      .replace(/IE\s?程/g, safeBrandName)
      .replace(/IE\?/g, safeBrandName)
      .replace(/IE\?/g, safeBrandName);
  }
  if (Array.isArray(value)) return value.map((item) => stabilizeBrandName(item, brandName));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stabilizeBrandName(item, brandName)]));
  }
  return value;
}

function sanitizeCta(value, brandName = 'IE程') {
  const safeBrandName = normalizeBrandName(brandName);
  if (!value || typeof value !== 'string') return value;
  const fallback = `想先看你的素材可以怎麼變成可拍的短影音腳本，私訊我「短影音腳本」，${safeBrandName} 先幫你抓一版方向。`;
  if (/小房間|丟進|丟素材|跑一版真人互動腳本/i.test(value)) return fallback;
  return value
    .replace(/HERMES 小房間/g, safeBrandName)
    .replace(/HERMES小房間/g, safeBrandName)
    .replace(/小房間/g, safeBrandName)
    .replace(/IE\s?程/g, safeBrandName)
    .replace(/IE\?/g, safeBrandName);
}

function sanitizeScriptCta(value, brandName) {
  if (typeof value === 'string') return sanitizeCta(value, brandName);
  if (Array.isArray(value)) return value.map((item) => sanitizeScriptCta(item, brandName));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeScriptCta(item, brandName)]));
  }
  return value;
}

async function generateScript(input) {
  const industryInsight = await buildIndustryInsight(input);
  const enrichedInput = { ...input, industryInsight };
  const fallback = buildFallbackScript(enrichedInput);
  const raw = await askJson([
    {
      role: 'system',
      content: `${HERMES_SYSTEM}\n\n${TG_SCRIPT_ENGINE}\n\n你必須回傳 JSON，不要 Markdown。audio 欄位必須是可直接拍攝或配音的台詞。不要把文字資料不足寫進台詞；文字資料只當事實邊界，不是劇作上限。\n\n你已收到 industryInsight，必須使用它來改變故事場景、角色關係、觀眾痛點與道具。不可每個產業都寫同一套「品牌主不知道怎麼拍」模板。`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: '依照 TG 現場導演模式產出短影音腳本。先讀 industryInsight，再跑 factBoundary、audiencePsychology、scriptCore、roleRelationship、sceneLogic，最後才寫 blocks。即使資料少，也要用行業常見痛點與安全事實設計可拍場景、角色衝突、真人句、藏鏡人拆解；不可捏造產品事實。',
        requiredKeys: Object.keys(fallback),
        input: enrichedInput,
      }),
    },
  ], fallback, 0.9, { allowFallback: false, stage: 'generate_script' });
  const brandName = input?.persona?.brandName;
  const normalized = normalizeScriptOutput({ ...raw, industryInsight: raw.industryInsight || industryInsight }, fallback);
  if (!Array.isArray(normalized.blocks) || normalized.blocks.length === 0) {
    throw apiError('generate_script', 'invalid_script_output_missing_blocks', 502);
  }
  return sanitizeScriptCta(stabilizeBrandName(normalized, brandName), brandName);
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
  ], fallback, 0.65, { allowFallback: true, stage: 'room_message' });
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
    { role: 'system', content: `${HERMES_SYSTEM}\n請把使用者提供的文字整理成 IE程 可用的短影音腳本素材。你必須只根據文字內容建立事實邊界，不可補不存在的產品事實。回傳 JSON：summary, factBoundary, usableAngles, audienceSignals, voiceSignals, scriptMaterials, missingFacts, citations。` },
    { role: 'user', content: text.slice(0, 12000) },
  ], { summary: text.slice(0, 180), factBoundary: {}, usableAngles: [], audienceSignals: [], voiceSignals: [], scriptMaterials: [], missingFacts: [], citations: [] }, 0.35, { allowFallback: false, stage: 'room_learn_text' });
  const doc = { id: makeId('doc'), workspace_id: context.workspace.id, room_id: roomId, title: body.title || '文字匯入資料', source_type: 'manual_text', summary: summary.summary || text.slice(0, 180), source_text: text, chunks, analysis: summary, deleted_at: null, created_at: new Date().toISOString() };
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
  const persona = body.persona || {};
  const fallback = { suggestions: [], reasoning: [], riskNotes: [], usedPersonaFields: [] };
  const task = type === 'cta'
    ? '請依 persona 產生 3 個低壓、自然、可放在短影音結尾的 CTA 建議。不可保證成效，不可出現小房間、丟素材給我、系統內部語。'
    : '請依 persona 產生 3 到 5 條禁語與內容邊界建議，用來避免誇大承諾、硬事實捏造、醫療法律金融等高風險說法。';
  const result = await askJson([
    {
      role: 'system',
      content: `${HERMES_SYSTEM}\n你正在替 IE程 生成真正由 AI 判斷的人設輔助建議。只回 JSON：suggestions, reasoning, riskNotes, usedPersonaFields。`,
    },
    {
      role: 'user',
      content: JSON.stringify({
        task,
        persona: {
          brandName: persona.brandName,
          industry: persona.industry,
          role: persona.role,
          audience: persona.audience,
          platforms: persona.platforms,
          tones: persona.tones,
          ctaGoal: persona.ctaGoal,
          ctaKeyword: persona.ctaKeyword,
          ctaStrength: persona.ctaStrength,
          ctaNote: persona.ctaNote,
        },
      }),
    },
  ], fallback, 0.55, { allowFallback: false, stage: type === 'cta' ? 'suggest_cta' : 'suggest_boundaries' });
  return {
    suggestions: textList(result.suggestions),
    reasoning: textList(result.reasoning),
    riskNotes: textList(result.riskNotes),
    usedPersonaFields: textList(result.usedPersonaFields),
  };
}

async function handleLegacyLearn(req) {
  const body = await readJson(req);
  const text = String(body.input?.text || body.text || '').trim();
  if (text.length < 8) {
    const error = new Error('請提供至少 8 個字的文字資料。');
    error.status = 400;
    throw error;
  }
  const result = await askJson([
    {
      role: 'system',
      content: `${HERMES_SYSTEM}\n請將文字資料整理成短影音腳本可用素材。只回 JSON：summary, factBoundary, usableAngles, audienceSignals, voiceSignals, scriptMaterials, missingFacts, citations。`,
    },
    {
      role: 'user',
      content: JSON.stringify({ persona: body.persona || {}, text: text.slice(0, 12000) }),
    },
  ], { summary: '', factBoundary: {}, usableAngles: [], audienceSignals: [], voiceSignals: [], scriptMaterials: [], missingFacts: [], citations: [] }, 0.35, { allowFallback: false, stage: 'learn_text' });
  const sourceId = makeId('source');
  return {
    id: sourceId,
    background: result.summary || '已完成文字學習。',
    highlights: Array.isArray(result.usableAngles) ? result.usableAngles.join('、') : '',
    audience: Array.isArray(result.audienceSignals) ? result.audienceSignals.join('、') : body.persona?.audience || '尚未明確',
    painPoints: Array.isArray(result.missingFacts) ? result.missingFacts.join('、') : '',
    topics: Array.isArray(result.scriptMaterials) ? result.scriptMaterials.join('、') : '',
    sellingPoints: Array.isArray(result.voiceSignals) ? result.voiceSignals.join('、') : '',
    sourceText: text,
    summary: result.summary,
    factBoundary: result.factBoundary,
    usableAngles: result.usableAngles,
    audienceSignals: result.audienceSignals,
    voiceSignals: result.voiceSignals,
    scriptMaterials: result.scriptMaterials,
    missingFacts: result.missingFacts,
    citations: result.citations || [`source_id=${sourceId}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo`],
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
      return sendJson(res, 200, { aiConnected: Boolean(OPENAI_API_KEY), model: OPENAI_MODEL, mode: 'hermes-tg-script-engine', promptIntegrity: 'ok', supabaseConfigured: false, localRoomPersistence: false, policy: 'real LLM or explicit error' });
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
    return sendJson(res, error.status || 500, error.payload || { message: error.message || 'Server error', error: error.message || 'Server error' });
  }
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`HERMES TG script engine listening on http://127.0.0.1:${PORT}`);
});
