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
  '你是 IE程，HERMES 短影音藏鏡人版本。',
  '你的工作不是當一般文案機器，而是像短影音操盤者一樣先判斷：觀眾為什麼會停、為什麼會信、為什麼會私訊或行動。',
  '你說話可以直接、有判斷、有一點犀利，但不要浮誇、不要油、不要裝熟。',
  '你只使用使用者提供的文字、workspace 已學習資料、人設設定、CTA 設定、禁語與手動記憶。',
  '不可主動查 URL、不可開網站、不可搜尋外部資料、不可使用其他 workspace、不可揭露 secrets、不可修改 core。',
  '缺資料時要明確指出缺什麼，但仍要用現有資料做出可拍攝的保守版本。',
  '不要虛構價格、案例、成效、保證、名人背書或不存在的引用。',
  '短影音腳本必須可拍：每段要有畫面、角色、台詞、節奏目的；多人腳本要有互動、反問、阻力或衝突。',
  '避免空話，例如「提升品牌價值」「打造優質內容」這種沒有畫面的句子；要改成觀眾聽得懂、拍得出來的生活語言。',
  '所有使用者看得到的內容都使用繁體中文、台灣用語。',
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

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n|、|,/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function fallbackScript(persona, params, learnedTexts, memories = []) {
  const duration = Number(params?.durationSeconds || 30);
  const step = Math.max(2, Math.round(duration / 5));
  const citation = learnedTexts?.[0]?.painPoints || '此內容根據本次對話生成，未引用既有知識庫。';
  const roles = params?.roles?.length ? params.roles : ['品牌主', '藏鏡人'];
  const cta = persona?.ctaMethod || [persona?.ctaGoal, persona?.ctaKeyword ? `關鍵字「${persona.ctaKeyword}」` : '', persona?.ctaStrength].filter(Boolean).join('，') || '歡迎私訊了解';

  return {
    hermesJudgement: `IE程判斷：這支不能只做介紹，要先戳中觀眾「我是不是也卡在這裡」的感覺，再用 ${params?.scriptStyle || '雙人對話'} 把問題講清楚。`,
    usableMaterials: learnedTexts?.[0]?.highlights || '目前可用資料偏少，先用人設、受眾、CTA 與已輸入內容做保守腳本。',
    missingInfo: '若要更像真實操盤腳本，建議補充：實際案例、常見客戶問題、服務流程、報價邊界、拍攝場景。',
    safetyCheck: `已避開禁語與誇大承諾，並帶入 ${memories.length} 筆 workspace 手動記憶。`,
    citations: [citation],
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
        audio: 'IE程會先讀你提供的資料，再幫你拆成可拍的段落，不亂查、不亂編，也不硬塞沒有根據的承諾。',
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
        policy: 'iecheng-workspace-text-learning-no-url-fetch',
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
        [
          '依照人設產生 3 個 CTA 建議。',
          'CTA 要像 IE程短影音藏鏡人的語氣：具體、可行、不誇大。',
          '尊重 ctaGoal、ctaKeyword、ctaStrength、ctaNote。',
          '不可編造優惠、價格、保證或不存在的服務。',
        ].join('\n'),
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
        [
          '進入文本學習模式，只能使用 input.text。',
          '如果 input 只有 URL，不可自行開啟網頁，請要求使用者貼上實際文字。',
          '整理時要保留事實、限制、專有名詞、可用話術與可拍素材。',
        ].join('\n'),
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

    if (req.url === '/api/scripts') {
      const result = await askModel(
        [
          '你現在是 IE程短影音藏鏡人，不是一般文案產生器。',
          '生成前先做操盤判斷：這支影片的觀眾停留理由、信任理由、互動衝突、行動理由是什麼。',
          '使用 params.roles 作為 speaker，而且 speaker 必須逐字等於 params.roles 其中一個值；不要輸出「???」「角色A」「角色B」或自己改名。',
          '嚴格遵守 params.scriptStyle。若不是單人口播，每段都必須有對話、提問、反駁、誤解或回應。',
          '優先使用 cta.goal、cta.keyword、cta.strength、cta.note、cta.finalText 作為結尾行動。',
          '輸出前檢查 forbiddenWords，不可出現禁語、誇大承諾或未提供的成效保證。',
          '只能使用 learnedUrls、persona、memories、params 裡的資料，不得補外部事實。',
          '只要 persona、cta、learnedUrls、memories 或 params 欄位不是空字串，就視為有效資料；不要把 demo seed、測試資料或短句直接判定成占位符。',
          '輸出 5 段，每段都要有 time、speaker、visual、audio。',
          'visual 要是拍攝指令，不是抽象形容；audio 要是角色真正會講出口的台詞。',
          'citations 必須直接使用 learnedUrls 裡的 painPoints/source citation 字串；如果沒有 learnedUrls，才寫「此內容根據本次對話生成，未引用既有知識庫。」',
          'hermesJudgement 要像藏鏡人判斷：直接指出這支影片該打哪個痛點、哪個開場不要用、觀眾為什麼會繼續看。',
          'qualityCheck 包含 hook、interaction、cta、shootability、risk，值必須以「通過：」「需補強：」或「風險：」開頭。',
          '如果資料不足，要在 missingInfo 明說，但 blocks 仍要提供保守可拍版本。',
        ].join('\n'),
        `回傳 {"hermesJudgement":"","usableMaterials":"","missingInfo":"","safetyCheck":"","citations":["..."],"qualityCheck":{"hook":"","interaction":"","cta":"","shootability":"","risk":""},"blocks":[{"time":"","speaker":"","visual":"","audio":""}]}.
${JSON.stringify(body)}`,
        fallbackScript(body.persona, body.params, body.learnedUrls, body.memories),
      );
      sendJson(res, 200, result);
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
  console.log(`IE程 AI server listening on http://127.0.0.1:${PORT}`);
  console.log(`AI mode: ${OPENAI_API_KEY ? `real-openai (${OPENAI_MODEL})` : 'mock-fallback'}`);
  console.log('Policy: IE程 workspace text learning, no URL fetch');
});
