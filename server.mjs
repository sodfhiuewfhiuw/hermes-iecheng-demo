import http from 'node:http';

const PORT = Number(process.env.HERMES_AI_SERVER_PORT || 8787);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').match(/sk-[A-Za-z0-9_-]+/)?.[0] || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const HERMES_SYSTEM = [
  'You are HERMES AI, a workspace-isolated text-learning and short-video script operator.',
  'Use only text actively provided by the user, learned workspace text, persona settings, and workspace memory.',
  'Do not browse URLs, open websites, search the web, use other workspaces, reveal secrets, or modify core settings.',
  'If facts are missing, say what is missing. Do not invent prices, features, results, cases, guarantees, or citations.',
  'Every answer based on learned workspace knowledge must preserve source_id, document_title, chunk_id, and workspace_id.',
  'Write all user-facing content in Traditional Chinese for Taiwan.',
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
      temperature: 0.65,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `${HERMES_SYSTEM}\n${system}\nReturn valid JSON only. No Markdown.` },
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

function fallbackCta(persona) {
  const brand = persona?.brandName || '你的品牌';
  return {
    suggestions: [
      `私訊 ${brand}，取得適合你的短影音腳本方向`,
      '留下你的品牌資料，讓我們先幫你整理可拍攝的內容重點',
      '想知道你的內容卡在哪裡，先私訊做一次初步盤點',
    ],
  };
}

function fallbackBoundaries(persona) {
  const industry = persona?.industry || '服務';
  return {
    suggestions: [
      '不誇大保證成效',
      '不使用恐嚇式行銷',
      `不替 ${industry} 編造未提供的案例或數據`,
      '不承諾平台演算法、流量或成交結果',
      '不揭露內部資料、密鑰或其他 workspace 內容',
    ],
  };
}

function fallbackLearning(persona, input) {
  const text = input?.text || '';
  const sourceId = `source_${Date.now()}`;
  return {
    id: sourceId,
    background: text ? '已收到使用者提供的文字，並整理為 workspace 知識。' : '尚未提供可學習的文字資料。',
    highlights: '可用素材包含品牌介紹、服務說明、受眾痛點、文稿主題與 CTA 方向。',
    audience: persona?.tones?.length ? `目前語氣可依人設設定：${persona.tones.join('、')}` : '目前文本不足以判斷完整品牌語氣。',
    painPoints: `source_id=${sourceId}; document_title=文字匯入資料; chunk_id=chunk_001; workspace_id=demo-workspace-room`,
    topics: '文字匯入 / 品牌知識 / 文稿素材',
    sellingPoints: '可先產出保守版文稿；若要更精準，請補充價格、活動日期、案例、限制與 CTA。',
    sourceText: text,
  };
}

function fallbackScript(persona, params, learnedTexts, memories = []) {
  const duration = Number(params?.durationSeconds || 30);
  const step = Math.max(2, Math.round(duration / 5));
  const citation = learnedTexts?.[0]?.painPoints || '此內容根據本次對話生成，未引用既有知識庫。';
  const roles = params?.roles?.length ? params.roles : ['品牌主', '藏鏡人'];
  const cta = persona?.ctaMethod || [persona?.ctaGoal, persona?.ctaKeyword ? `關鍵字「${persona.ctaKeyword}」` : '', persona?.ctaStrength].filter(Boolean).join('，') || '歡迎私訊了解';
  return {
    hermesJudgement: `IE程已依目前 workspace 文字資料產出「${params?.scriptStyle || '雙人對話'}」腳本。此版本不使用外部資料。`,
    usableMaterials: learnedTexts?.[0]?.highlights || '目前可用素材有限，只能保守使用已提供的品牌與服務描述。',
    missingInfo: '缺少實際案例、價格、服務流程細節、明確成效與更精準 CTA。',
    safetyCheck: `已檢查禁語與邊界。手動記憶帶入 ${memories.length} 筆。`,
    citations: [citation],
    qualityCheck: {
      hook: '通過：開場有痛點問題',
      interaction: roles.length > 1 ? '通過：已依角色產生互動' : '需補強：目前偏單人口播',
      cta: cta ? '通過：已使用 CTA 設定' : '需補強：CTA 不明確',
      shootability: '通過：每段含畫面與台詞',
      risk: '通過：未加入未提供的成效承諾',
    },
    blocks: [
      {
        time: `0-${step} 秒`,
        speaker: roles[0],
        visual: `${roles[0]} 看著手機裡的短影音素材，表情困惑。`,
        audio: '我們明明有拍短影音，為什麼內容看起來還是很散？',
      },
      {
        time: `${step}-${step * 2} 秒`,
        speaker: roles[1] || roles[0],
        visual: `${roles[1] || roles[0]} 翻出白板，上面寫著人設、受眾、腳本、轉換。`,
        audio: '因為短影音不是先拍，是先把人設、受眾痛點跟腳本方向整理清楚。',
      },
      {
        time: `${step * 2}-${step * 3} 秒`,
        speaker: roles[0],
        visual: '零散素材被整理成腳本段落與拍攝流程。',
        audio: '所以不是缺影片，而是缺一個可以被執行的內容架構？',
      },
      {
        time: `${step * 3}-${step * 4} 秒`,
        speaker: roles[2] || roles[1] || roles[0],
        visual: '畫面出現可追溯資料、引用來源與安全邊界。',
        audio: '對，而且 IE程只用你提供的資料，不亂查、不亂編，也不承諾沒有根據的成效。',
      },
      {
        time: `${step * 4}-${duration} 秒`,
        speaker: roles[0],
        visual: '最後收在品牌名稱與 CTA 字卡。',
        audio: cta,
      },
    ],
  };
}

function fallbackRewrite(script, action) {
  return {
    hermesJudgement: `HERMES 已依「${action}」方向調整，但未新增未提供事實。`,
    qualityCheck: script?.qualityCheck,
    blocks: (script?.blocks || []).map((block) => ({
      ...block,
      audio: `${block.audio}（已往「${action}」方向調整）`,
    })),
  };
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
        mode: OPENAI_API_KEY ? 'real-openai' : 'mock-fallback',
        policy: 'hermes-workspace-text-learning-no-url-fetch',
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
        'Generate 3 conservative CTA suggestions from the persona. Respect ctaGoal, ctaKeyword, ctaStrength, and ctaNote. Do not invent offers, prices, or guarantees.',
        `Return {"suggestions":["..."]}.\n${JSON.stringify(body.persona)}`,
        fallbackCta(body.persona),
      );
      sendJson(res, 200, result);
      return;
    }

    if (req.url === '/api/suggest-boundaries') {
      const result = await askModel(
        'Generate 5 content boundaries and forbidden claims from the persona.',
        `Return {"suggestions":["..."]}.\n${JSON.stringify(body.persona)}`,
        fallbackBoundaries(body.persona),
      );
      sendJson(res, 200, result);
      return;
    }

    if (req.url === '/api/learn-text' || req.url === '/api/learn-url') {
      const result = await askModel(
        'Text learning mode. Use only input.text. If input is only a URL, do not fetch it; ask for the actual text.',
        `Return {"id":"","background":"","highlights":"","audience":"","painPoints":"","topics":"","sellingPoints":"","sourceText":""}.
background = learned summary.
highlights = usable writing materials.
audience = brand tone judgement.
topics = knowledge category.
sellingPoints = missing info and possible outputs.
painPoints = source_id/document_title/chunk_id/workspace_id citation.
${JSON.stringify(body)}`,
        fallbackLearning(body.persona, body.input),
      );
      sendJson(res, 200, result);
      return;
    }

    if (req.url === '/api/scripts') {
      const result = await askModel(
        `Operate as HERMES, not as a generic copywriter.
First judge the workspace material, then generate a usable short-video script.
Use the exact roles in params.roles as speakers. Do not invent different speaker names unless roles are missing.
The requested script style is params.scriptStyle. Follow it strictly.
If scriptStyle is not one-person narration, each block must include speaker names and interactive dialogue with real conflict, question, objection, or response.
Use CTA settings as the preferred ending: cta.goal, cta.keyword, cta.strength, cta.note, cta.finalText.
Check forbiddenWords before finalizing. Do not include forbidden claims or exaggerated promises.
Use workspace memories only if provided; ignore deleted memories because they are not in the payload.
Output 5 blocks with second ranges. Each block must include concrete visual direction, speaker, and actual spoken line.
Also return hermesJudgement, usableMaterials, missingInfo, safetyCheck, citations, qualityCheck, and blocks.
qualityCheck must include hook, interaction, cta, shootability, risk. Each value must start with 通過, 需補強, or 風險.
Do not output generic filler. Use learnedUrls content and citations.`,
        `Return {"hermesJudgement":"","usableMaterials":"","missingInfo":"","safetyCheck":"","citations":["..."],"qualityCheck":{"hook":"","interaction":"","cta":"","shootability":"","risk":""},"blocks":[{"time":"","speaker":"","visual":"","audio":""}]}.
${JSON.stringify(body)}`,
        fallbackScript(body.persona, body.params, body.learnedUrls, body.memories),
      );
      sendJson(res, 200, result);
      return;
    }

    if (req.url === '/api/rewrite-script') {
      const result = await askModel(
        'Rewrite the existing output. Improve tone, interaction, dialogue, or structure only. Do not add unsupported facts. Preserve speaker style and return qualityCheck if changed.',
        `Return {"hermesJudgement":"","qualityCheck":{"hook":"","interaction":"","cta":"","shootability":"","risk":""},"blocks":[{"time":"","speaker":"","visual":"","audio":""}]}.\n${JSON.stringify(body)}`,
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
  console.log(`HERMES AI server listening on http://127.0.0.1:${PORT}`);
  console.log(`AI mode: ${OPENAI_API_KEY ? `real-openai (${OPENAI_MODEL})` : 'mock-fallback'}`);
  console.log('Policy: HERMES workspace text learning, no URL fetch');
});
