# HERMES / IE程 Fallback 清理盤點與一次性改造計畫

本文件盤點目前專案中仍存在的舊版 fallback、假 AI、Demo 殘留、小房間殘留與亂碼文案。  
目的不是立刻全部刪掉，而是先分級，下一輪一次性改掉，避免產品行為又混在一起。

## 核心判斷

目前最大的問題不是「有沒有接 API」，而是幾種狀態混在同一條產品路徑裡：

- 真 LLM 產出
- server fallback
- frontend fallback
- local demo state
- 之前的小房間 UX 殘留
- 舊版 mock / hardcoded 文案
- 亂碼殘留

使用者看到的結果會變得不可信：按「AI 建議」時，可能其實只是固定文案；產生腳本失敗時，也可能被 frontend silently fallback 成一份空白或假草稿。

## P0：必須優先改掉

### 1. AI 建議是假的 fallback

位置：

- `server.mjs`：`handleSuggest(req, type)`
- `src/api.ts`：`api.suggestCta`
- `src/api.ts`：`api.suggestBoundaries`
- `src/views/PersonaView.tsx`：CTA / 禁語的「AI 建議」按鈕

問題：

- server 目前直接回固定 suggestions，沒有呼叫 LLM。
- frontend catch 後又回固定亂碼/模板 suggestions。
- 使用者會以為這是 AI 判斷過的人設建議，但其實不是。

改造方向：

- `/api/suggest-cta` 必須呼叫 LLM。
- `/api/suggest-boundaries` 必須呼叫 LLM。
- prompt 必須使用目前 persona：品牌、產業、定位、平台、受眾、語氣、CTA 目的。
- 輸出必須包含：
  - `suggestions`
  - `reasoning`
  - `riskNotes`
  - `usedPersonaFields`
- 前端如果 API 失敗，不可以回假建議；要顯示「AI 建議暫時失敗，請稍後再試」。

建議 server schema：

```json
{
  "suggestions": ["..."],
  "reasoning": ["..."],
  "riskNotes": ["..."],
  "usedPersonaFields": ["brandName", "industry", "audience", "tones"]
}
```

### 2. 腳本生成失敗被 frontend 靜默吞掉

位置：

- `src/api.ts`：`api.generateScript`
- `src/api.ts`：`api.rewriteScript`

問題：

目前：

```ts
const result = await request<any>('/api/scripts', ...).catch(() => null);
const script = toScriptData(result, params);
```

這代表 API 失敗時，前端仍然會建立一份空草稿或 fallback 草稿。  
使用者會以為 AI 有產出，但其實沒有。

改造方向：

- `generateScript` 失敗時要 throw error。
- UI 顯示錯誤狀態，不新增草稿。
- server 若使用 fallback，必須回傳 `isFallback: true` / `fallbackReason`。
- 前端若看到 fallback，要顯示「AI 失敗，這是保底草稿」或直接不接受 fallback。

### 3. `askJson()` 失敗時自動回 fallback

位置：

- `server.mjs`：`askJson(messages, fallback, temperature)`

問題：

目前 OpenAI key 無效、API 失敗、JSON parse 失敗，都會回 fallback。  
這是之前造成「看起來有 AI，其實沒有」的核心問題。

改造方向：

- `askJson` 新增 options：
  - `allowFallback: boolean`
  - `stage: string`
- 對產品主路徑：
  - AI 建議：不允許 fallback
  - 正式腳本：預設不允許 fallback，除非使用者打開「保底草稿」
  - dev 測試：可以 fallback，但 UI 要標示
- 錯誤回傳要包含：
  - `errorCode`
  - `stage`
  - `model`
  - `fallbackUsed`

## P1：舊版小房間與 Demo 殘留

### 4. 小房間詞彙混在正式產品裡

位置：

- `server.mjs`
- `src/api.ts`
- `src/components/Sidebar.tsx`
- `src/components/ContextPanel.tsx`
- `src/views/HermesRoomView.tsx`
- `src/views/ScriptWorkbenchView.tsx`
- `README.md`

問題：

目前產品方向已回到「IE程 短影音腳本生成器 / HERMES 腳本引擎」。  
但 UI、server、README 仍大量出現「HERMES 小房間」。

處理建議：

- 對外 UI：改成「IE程 工作區」或「HERMES 腳本引擎」。
- 內部狀態：可以保留 `room_state` 概念，但不要出現在使用者腳本或 CTA。
- Sidebar 不要把小房間當主功能，除非之後重做成真 LLM 常駐工作區。

### 5. dev login 111 / 111

位置：

- `src/api.ts`：`DEV_SESSION_KEY`, `DEV_TOKEN`, `makeDevSession`
- `src/views/HermesRoomView.tsx`
- `server.mjs`：`requireLocalUser`

問題：

這是本機測試用，不能混成商品功能。

處理建議：

- 保留，但標明 `DEV_AUTH_ENABLED=true` 時才啟用。
- UI 文字清楚顯示「本機測試模式」。
- build / README 分清：
  - local demo
  - production mode

### 6. local in-memory state 偽持久化

位置：

- `server.mjs`：`store`
- `server.mjs`：`.local/room-store.json`
- `src/api.ts`：`currentPersona`, `learnedTexts`, `scriptsLibrary`, `workspaceMemories`

問題：

目前前端也有一份 local state，server 也有一份 local room store。  
兩套 state 容易不同步。

處理建議：

- 短期：明確指定「表單工作台用 frontend local state；AI server 用 server local state」。
- 中期：全部走 server API。
- 正式：接 Supabase DB。

## P2：亂碼與舊 mock 文案

### 7. 多個前端檔案仍有亂碼

位置：

- `src/api.ts`
- `src/views/PersonaView.tsx`
- `src/views/ScriptWorkbenchView.tsx`
- `src/components/ContextPanel.tsx`
- 可能還有其他 UI 文案

問題：

亂碼會污染 prompt、CTA、persona、UI placeholder。  
即使 LLM 正常，輸入本身也可能被污染。

處理建議：

- 一次性重建前端中文文案常數。
- 把 UI 文案抽成 `src/content/zh-TW.ts`。
- 禁止亂碼常數留在 persona 預設值與 prompt payload。

### 8. `learn-text` 仍是固定整理回應

位置：

- `server.mjs`：`handleLegacyLearn`
- `src/api.ts`：`api.learnUrl`

問題：

使用者匯入文字時，server 回的是固定欄位，不是真正 LLM 學習摘要。  
frontend catch 又有假資料 fallback。

改造方向：

- `/api/learn-text` 呼叫 LLM。
- 必須輸出：
  - `factBoundary`
  - `summary`
  - `usableAngles`
  - `audienceSignals`
  - `voiceSignals`
  - `scriptMaterials`
  - `missingFacts`
  - `citations`
- API 失敗不要假裝學習成功。

## P3：架構整理

### 9. prompt stage files 目前大多只是占位

位置：

- `prompts/classify_intent.md`
- `prompts/update_room_memory.md`
- `prompts/distill_voice_dna.md`
- `prompts/simulate_scene.md`
- `prompts/extract_real_lines.md`
- `prompts/build_story_beats.md`
- `prompts/draft_script.md`
- `prompts/human_speech_check.md`

問題：

這些檔案存在，但目前主流程仍主要使用：

- `prompts/hermes.system.md`
- `prompts/tg_script_engine.md`

處理建議：

- 短期：保留但標註為 future pipeline。
- 中期：真的拆 stage，讓每個 stage 可測。
- 若不拆，刪除占位檔，避免誤導。

### 10. README 仍寫小房間 Demo

位置：

- `README.md`

問題：

目前 README 與產品方向不一致。

處理建議：

- 改成「IE程 / HERMES 短影音腳本生成器」。
- 清楚區分：
  - current local AI server
  - planned Supabase
  - planned WSL HERMES artifact
  - fallback policy

## 一次性改造建議順序

### Step 1：關閉假 AI

- `suggestCta` 改真 LLM。
- `suggestBoundaries` 改真 LLM。
- `learnText` 改真 LLM。
- API 失敗不回假資料。

### Step 2：建立明確 fallback policy

新增：

```ts
type FallbackPolicy = 'disabled' | 'dev-only' | 'visible-to-user';
```

主產品路徑：

- AI 建議：`disabled`
- 文字學習：`disabled`
- 正式腳本：`visible-to-user` 或 `disabled`
- local smoke test：`dev-only`

### Step 3：清乾淨 UI 舊文案

- 移除小房間對外文案。
- 修掉亂碼。
- 重建 persona / workbench / context panel 文案。

### Step 4：統一資料來源

- 短期先統一到 server local state。
- 前端不要自己偽造 scripts / learnedTexts。
- 若 API 失敗，UI 顯示錯誤。

### Step 5：再做真 pipeline 拆分

- factBoundary
- audiencePsychology
- sceneLogic
- realLines
- draftScript
- qualityScore

每個 stage 都有獨立測試 payload 與輸出 schema。

## 本輪不建議馬上改的東西

- 不要立刻接 Supabase。
- 不要立刻重做小房間。
- 不要立刻刪除所有 fallback，否則 dev server 會很難測。
- 不要直接大改 UI 結構，先把「假 AI」和「亂碼輸入」拿掉。

## 下一輪建議實作目標

建議下一輪只做一個明確任務：

> 把 AI 建議 / 文字學習 / 腳本生成三個產品主路徑改成「真 LLM 或明確失敗」，不再 silent fallback。

完成標準：

- 按 AI 建議時，server log / response 可看出是模型回傳。
- OpenAI API 故障時，前端顯示錯誤，不產假建議。
- 產生腳本失敗時，不新增空草稿。
- response 內若用了 fallback，必須明確標示 `isFallback: true`。
- 所有亂碼預設值不能再進入 prompt。
