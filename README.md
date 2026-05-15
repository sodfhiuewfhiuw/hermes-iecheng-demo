# IE Cheng Short Video Script Demo

This repository contains the MVP demo for the IE Cheng short-video script generator.

It includes:

- React + Vite frontend
- Local Node.js AI bridge server
- Workspace-style text learning demo state
- Persona, CTA, forbidden-claims, role-based script generation, and quality checks

This demo does not include the final WSL HERMES runtime artifact. The current AI bridge calls the OpenAI API through a local server.

## Requirements

- Node.js 18 or newer
- npm
- An OpenAI API key

## Setup

```powershell
npm install
```

Create a local `.env` file or set environment variables manually:

```powershell
$env:OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
$env:OPENAI_MODEL="gpt-5.4-mini"
$env:HERMES_AI_SERVER_PORT="8787"
```

Do not commit `.env` or any real API key.

## Run The AI Server

```powershell
npm run ai-server
```

The AI server runs at:

```text
http://127.0.0.1:8787
```

## Run The Frontend

Open a second terminal:

```powershell
npm run dev
```

The frontend runs at:

```text
http://127.0.0.1:5173
```

Vite proxies `/api` requests to the local AI server.

## Build

```powershell
npm run build
```

## Push Updates To GitHub

After the first Git remote is configured, use:

```powershell
.\auto_push.ps1 "update message"
```

The script runs `git add .`, `git commit`, and `git push`.

## Safety Notes

- User-provided learning text is demo state only.
- The app does not fetch URLs or browse the web.
- API keys must stay server-side.
- The OpenAI key is read from `OPENAI_API_KEY`.
- The repo should never contain files with `sk-...` API keys.

## Demo Scope

Current MVP features:

- Persona setup
- CTA customization
- Forbidden words / content boundaries
- Text learning room
- Learning-data deletion
- Manual memory deletion
- Role-based short-video script output
- Script quality check
- Script library

Out of scope for this base version:

- Production login
- Supabase persistence
- Billing / usage limits
- WSL HERMES runtime adapter
- Tenant-grade database isolation
