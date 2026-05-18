# HERMES / IE程 小房間 Demo

React + Vite 前端，加上一個本機 Node.js AI bridge server。這版主體是「HERMES 小房間」：登入後建立 room，使用者貼素材、補充口吻，server 讀取 `room_state / documents / memories / messages`，再跑 HERMES pipeline 產出短影音腳本草稿。

## Install

```bash
npm install
```

## Environment

複製 `.env.example` 成 `.env`，填入需要的值：

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
HERMES_AI_SERVER_PORT=8787
APP_ORIGIN=http://127.0.0.1:5173

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

API key 與 service role key 不要提交到 GitHub。

## Supabase Setup

1. 建立 Supabase 專案。
2. 到 SQL Editor 依序執行：
   - `supabase/schema.sql`
   - `supabase/rls.sql`
3. 開啟 Email/Password Auth。
4. 把 Project URL、anon key、service role key 填入 `.env`。

## Run

開兩個 terminal：

```bash
npm run ai-server
```

```bash
npm run dev
```

前端預設在 [http://127.0.0.1:5173](http://127.0.0.1:5173)。
AI server 預設在 [http://127.0.0.1:8787](http://127.0.0.1:8787)。

## Runtime APIs

- `GET /api/status`
- `POST /api/rooms`
- `GET /api/rooms/:roomId/state`
- `POST /api/rooms/:roomId/messages`
- `POST /api/rooms/:roomId/learn-text`
- `POST /api/rooms/:roomId/generate-script`
- `POST /api/rooms/:roomId/delete-memory`
- `POST /api/rooms/:roomId/delete-document`

舊版 fallback 仍保留：

- `POST /api/learn-text`
- `POST /api/scripts`
- `POST /api/rewrite-script`
- `POST /api/suggest-cta`
- `POST /api/suggest-boundaries`

## HERMES Pipeline

完整腳本產出走這條路徑：

```text
classify_intent
update_room_memory
distill_voice_dna
simulate_scene
extract_real_lines
build_story_beats
draft_script
human_speech_check
persist_state
```

第一版是訊息喚醒，不做背景自動跑，也不接正式 WSL HERMES artifact。
