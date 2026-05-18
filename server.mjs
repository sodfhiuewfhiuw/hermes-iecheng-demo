import http from 'node:http';

const PORT = Number(process.env.HERMES_AI_SERVER_PORT || 8787);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').match(/sk-[A-Za-z0-9_-]+/)?.[0] || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const OPENAI_SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL || OPENAI_MODEL;

const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const HERMES_SYSTEM = [
  'You are IE Cheng, the HERMES short-video operator version.',
  'You are not a generic copywriter. Think like a short-video strategist: why will viewers stop, trust, interact, and act?',
  'Use Traditional Chinese for Taiwan in every user-facing field.',
  'Use workspace text as brand facts. Use public web research only as market context when explicitly provided.',
  'Do not invent prices, case studies, guarantees, claims, or citations.',
  'For short-video scripts, every block must be shootable: time, speaker, visual direction, and spoken line.',
  'For multi-person scripts, create real interaction: question, objection, misunderstanding, conflict, or response.',
  'Do not browse URLs by yourself in normal text-learning mode. Only the controlled public-research step may use web search.',
].join('\n');

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

function fallbackCta(persona) {
  const brand = persona?.brandName || '你的品牌';
  const keyword = persona?.ctaKeyword || '短影音健檢';
  return {
    suggestions: [
      `想知道你的帳號卡在哪裡，私訊「${keyword}」，我幫你先抓出一個最該修的問題。`,
      `如果你也不想再亂拍，私訊「${keyword}」，先把人設、內容方向和 CTA 拆清楚。`,
      `你可以先把目前的帳號狀況丟給 ${brand}，我們會用短影音操盤角度幫你看問題。`,
    ],
  };
}

function fallbackBoundaries(persona) {
  const industry = persona?.industry || '服務內容';
  return {
    suggestions: [
      '不保證流量、成交或業績結果。',
      '不使用恐嚇式行銷或過度焦慮語氣。',
      `不把 ${industry} 說成沒有風險、沒有條件限制。`,
      '沒有案例、數據或價格時，不自行編造。',
      '不引用未提供的客戶資料、截圖或私人資訊。',
    ],
  };
}

function fallbackLearning(persona, input) {
  const text = input?.text || '';
  const sourceId = `source_${Date.now()}`;
  return {
    id: sourceId,
    background: text
      ? '已將使用者提供的文字整理成 workspace 學習資料，後續可作為腳本、人設與文案素材。'
      : '尚未提供可學習的文字內容，請貼上品牌、服務、案例或銷售話術。',
    highlights: text
      ? '可用素材包含品牌定位、服務說明、受眾痛點、內容主題與 CTA 線索。'
      : '目前沒有足夠資料可整理成文稿素材。',
    audience: persona?.tones?.length
      ? `目前語氣可依人設設定：${persona.tones.join('、')}。`
      : '目前文本不足以判斷完整品牌語氣。',
    painPoints: `source_id=${sourceId}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo-workspace-room`,
    topics: '品牌 / 服務 / 話術 / 短影音腳本素材',
    sellingPoints: '可用來產出社群貼文、短影音腳本、FAQ、EDM 與私訊引導文案；若要更準，需要補受眾、案例、限制與 CTA。',
    sourceText: text,
  };
}

function fallbackScript(persona, params, learnedTexts, memories = [], publicResearch = null) {
  const duration = Number(params?.durationSeconds || 30);
  const step = Math.max(2, Math.round(duration / 5));
  const citation = learnedTexts?.[0]?.painPoints || '此內容根據本次對話生成，未引用既有知識庫。';
  const roles = params?.roles?.length ? params.roles : ['品牌主', '藏鏡人'];
  const cta = persona?.ctaMethod || [persona?.ctaGoal, persona?.ctaKeyword ? `關鍵字「${persona.ctaKeyword}」` : '', persona?.ctaStrength].filter(Boolean).join('，') || '歡迎私訊了解';
  const marketLine = publicResearch?.industrySnapshot
    ? `公開資訊補充：${publicResearch.industrySnapshot}`
    : '未啟用公開產業資訊查詢，本次以 workspace 資料與人設為主。';

  return {
    hermesJudgement: `IE程判斷：這支不能只做介紹，要先戳中觀眾「我是不是也卡在這裡」的感覺，再用 ${params?.scriptStyle || '雙人對話'} 把問題講清楚。${marketLine}`,
    usableMaterials: learnedTexts?.[0]?.highlights || '目前可用資料偏少，先用人設、受眾、CTA 與已輸入內容做保守腳本。',
    missingInfo: '若要更像真實操盤腳本，建議補充：實際案例、常見客戶問題、服務流程、報價邊界、拍攝場景。',
    safetyCheck: `已避開禁語與誇大承諾，並帶入 ${memories.length} 筆 workspace 手動記憶。公開資訊只作市場參考，不改寫品牌事實。`,
    citations: publicResearch?.sources?.length ? [citation, ...publicResearch.sources] : [citation],
    publicResearch,
    qualityCheck: {
      hook: '通過：開場直接點出觀眾可能卡住的問題。',
      interaction: roles.length > 1 ? '通過：已使用角色對話製造提問與回應。' : '需補強：單人口播可以再增加反問節奏。',
      cta: cta ? '通過：結尾已使用設定 CTA。' : '需補強：尚未設定明確 CTA。',
      shootability: '通過：每段都有可拍畫面方向。',
      risk: '通過：未加入未提供的成效保證。',
    },
    blocks: [
      {
        time: `0-${step} 秒`,
        speaker: roles[0],
        visual: `${roles[0]} 看著手機後停住，畫面切到短影音帳號頁或內容清單。`,
        audio: '你有沒有發現，很多影片不是拍不好，是觀眾根本不知道你是誰、你能幫他解決什麼。',
      },
      {
        time: `${step}-${step * 2} 秒`,
        speaker: roles[1] || roles[0],
        visual: `${roles[1] || roles[0]} 把白板分成「人設」「痛點」「信任」「CTA」四格。`,
        audio: '先不要急著想腳本。短影音要有效，第一步是把觀眾為什麼要停下來看你講清楚。',
      },
      {
        time: `${step * 2}-${step * 3} 秒`,
        speaker: roles[0],
        visual: '畫面放大到觀眾留言、私訊或常見問題的示意卡片。',
        audio: '如果你的內容一直只是在介紹服務，觀眾會覺得跟他無關；你要先講中他的問題。',
      },
      {
        time: `${step * 3}-${step * 4} 秒`,
        speaker: roles[1] || roles[0],
        visual: '白板上出現一條腳本動線：問題、誤解、解法、行動。',
        audio: 'IE程會先讀你提供的資料，再用公開資訊補市場現況，但不會把網路資料亂講成你的品牌承諾。',
      },
      {
        time: `${step * 4}-${duration} 秒`,
        speaker: roles[0],
        visual: '最後定格在 CTA 字卡與私訊畫面。',
        audio: cta,
      },
    ],
  };
}

function fallbackRewrite(script, action) {
  return {
    hermesJudgement: `IE程已依「${action}」調整腳本，但沒有新增未提供的事實。`,
    qualityCheck: script?.qualityCheck,
    blocks: (script?.blocks || []).map((block) => ({
      ...block,
      audio: `${block.audio}（已往「${action}」方向收斂）`,
    })),
  };
}

async function askModel(system, user, fallback) {
  if (!OPENAI_API_KEY) return fallback;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.72,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${HERMES_SYSTEM}\n${system}\n只回傳 valid JSON，不要 Markdown，不要解釋 JSON 以外的內容。` },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return content ? JSON.parse(content) : fallback;
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

function extractWebSources(data) {
  const sources = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value.url === 'string' && /^https?:\/\//.test(value.url)) sources.push(value.title ? `${value.title}: ${value.url}` : value.url);
    Object.values(value).forEach(visit);
  };
  visit(data?.output);
  return Array.from(new Set(sources)).slice(0, 8);
}

async function researchPublicMarket(body) {
  if (!OPENAI_API_KEY || !body?.params?.usePublicResearch) return null;

  const persona = body.persona || {};
  const params = body.params || {};
  const prompt = [
    'Use public web search to research current market context for short-video planning.',
    'Research only public information. Do not search private customer data.',
    'Focus on industry status, audience signals, popular content angles, platform behavior, and risk notes.',
    'Do not make brand-specific claims unless they are provided in the input.',
    'Return every field in Traditional Chinese for Taiwan.',
    'Return compact JSON only with this shape:',
    '{"industrySnapshot":"","audienceSignals":[""],"popularAngles":[""],"platformNotes":[""],"riskNotes":[""],"sources":[""]}',
    '',
    `Brand: ${persona.brandName || ''}`,
    `Industry: ${persona.industry || ''}`,
    `Audience: ${persona.audience || ''}`,
    `Platforms: ${(persona.platforms || []).join(', ')} / ${params.platform || ''}`,
    `Purpose: ${params.purpose || ''}`,
  ].join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_SEARCH_MODEL,
        tools: [{ type: 'web_search' }],
        tool_choice: 'auto',
        include: ['web_search_call.action.sources'],
        input: prompt,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        industrySnapshot: '公開資訊查詢失敗，本次改用 workspace 資料與人設判斷。',
        audienceSignals: [],
        popularAngles: [],
        platformNotes: [],
        riskNotes: [`web_search_error: ${response.status} ${text.slice(0, 160)}`],
        sources: [],
      };
    }

    const data = await response.json();
    const raw = extractOutputText(data);
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    const sources = Array.from(new Set([...(parsed.sources || []), ...extractWebSources(data)]))
      .filter((source) => typeof source === 'string' && /^https?:\/\//.test(source.replace(/^.*?:\s*/, '')))
      .slice(0, 8);
    return { ...parsed, sources };
  } catch (error) {
    return {
      industrySnapshot: '公開資訊查詢失敗，本次改用 workspace 資料與人設判斷。',
      audienceSignals: [],
      popularAngles: [],
      platformNotes: [],
      riskNotes: [error instanceof Error ? error.message : String(error)],
      sources: [],
    };
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/api/status') {
      sendJson(res, 200, {
        aiConnected: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
        searchModel: OPENAI_SEARCH_MODEL,
        mode: OPENAI_API_KEY ? 'real-openai' : 'mock-fallback',
        policy: 'workspace-facts-plus-optional-public-research',
      });
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    const body = await readJson(req);

    if (req.url === '/api/suggest-cta') {
      const result = await askModel(
        '依照人設產生 3 個 CTA 建議。CTA 要具體、可行、不誇大。尊重 ctaGoal、ctaKeyword、ctaStrength、ctaNote。',
        `回傳 {"suggestions":["..."]}。\n${JSON.stringify(body.persona)}`,
        fallbackCta(body.persona),
      );
      sendJson(res, 200, result);
      return;
    }

    if (req.url === '/api/suggest-boundaries') {
      const result = await askModel(
        '依照人設產生 5 條禁語或內容邊界。要具體、可執行，避免誇大承諾與敏感風險。',
        `回傳 {"suggestions":["..."]}。\n${JSON.stringify(body.persona)}`,
        fallbackBoundaries(body.persona),
      );
      sendJson(res, 200, result);
      return;
    }

    if (req.url === '/api/learn-text' || req.url === '/api/learn-url') {
      const result = await askModel(
        '文本學習模式，只能使用 input.text。如果 input 只有 URL，不可自行開啟網頁，請要求使用者貼上實際文字。',
        `回傳 {"id":"","background":"","highlights":"","audience":"","painPoints":"","topics":"","sellingPoints":"","sourceText":""}.
background = 3 到 5 點學習摘要。
highlights = 可用於文稿與短影音的素材。
audience = 受眾與品牌語氣判斷。
topics = 知識分類。
sellingPoints = 缺少資訊與可產出內容。
painPoints = source_id/document_title/chunk_id/workspace_id citation。
${JSON.stringify(body)}`,
        fallbackLearning(body.persona, body.input),
      );
      sendJson(res, 200, result);
      return;
    }

    if (req.url === '/api/public-research') {
      const result = await researchPublicMarket({ ...body, params: { ...(body.params || {}), usePublicResearch: true } });
      sendJson(res, 200, result || { industrySnapshot: '未啟用公開資訊查詢。', sources: [] });
      return;
    }

    if (req.url === '/api/scripts') {
      const publicResearch = await researchPublicMarket(body);
      const result = await askModel(
        [
          '你現在是 IE程短影音藏鏡人，不是一般文案產生器。',
          'workspace learned text is the source of brand facts.',
          'publicResearch, if present, is only market context for industry status, audience, and content angles.',
          'Never turn public market context into brand-specific proof, guarantee, case, price, or claim.',
          'Use params.roles exactly as speaker names. Speaker must equal one of params.roles.',
          'If scriptStyle is not one-person narration, every block must include interaction, objection, question, or response.',
          'Use cta.goal, cta.keyword, cta.strength, cta.note, cta.finalText as the preferred ending.',
          'Check forbiddenWords before finalizing.',
          'Output 5 blocks with time, speaker, visual, audio.',
          'visual must be shootable direction. audio must be real spoken dialogue.',
          'citations must include workspace citation strings and publicResearch.sources if used.',
          'qualityCheck values must start with 「通過：」「需補強：」or「風險：」.',
        ].join('\n'),
        `回傳 {"hermesJudgement":"","usableMaterials":"","missingInfo":"","safetyCheck":"","citations":["..."],"publicResearch":null,"qualityCheck":{"hook":"","interaction":"","cta":"","shootability":"","risk":""},"blocks":[{"time":"","speaker":"","visual":"","audio":""}]}.
${JSON.stringify({ ...body, publicResearch })}`,
        fallbackScript(body.persona, body.params, body.learnedUrls, body.memories, publicResearch),
      );
      sendJson(res, 200, { ...result, publicResearch: result.publicResearch || publicResearch });
      return;
    }

    if (req.url === '/api/rewrite-script') {
      const result = await askModel(
        '改寫現有腳本。只改善語氣、互動、對話、拍攝結構與 CTA，不新增未提供事實。保留角色風格，必要時更新 qualityCheck。',
        `回傳 {"hermesJudgement":"","qualityCheck":{"hook":"","interaction":"","cta":"","shootability":"","risk":""},"blocks":[{"time":"","speaker":"","visual":"","audio":""}]}。\n${JSON.stringify(body)}`,
        fallbackRewrite(body.script, body.action),
      );
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`IE Cheng AI server listening on http://127.0.0.1:${PORT}`);
  console.log(`AI mode: ${OPENAI_API_KEY ? `real-openai (${OPENAI_MODEL})` : 'mock-fallback'}`);
  console.log(`Search model: ${OPENAI_SEARCH_MODEL}`);
  console.log('Policy: workspace facts plus optional public research');
});
