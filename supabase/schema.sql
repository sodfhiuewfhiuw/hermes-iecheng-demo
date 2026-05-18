create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null default 'HERMES 小房間',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  output_type text not null default 'chat' check (output_type in ('chat', 'question', 'simulation', 'script', 'quality_check')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.room_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  current_stage text not null default 'idle',
  active_persona_id uuid,
  voice_dna jsonb not null default '{}'::jsonb,
  latest_rehearsal jsonb not null default '[]'::jsonb,
  real_lines jsonb not null default '[]'::jsonb,
  story_beats jsonb not null default '{}'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  last_quality_check jsonb not null default '{}'::jsonb,
  active_script_draft_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.personas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_name text not null,
  industry text,
  role text,
  audience text,
  tones jsonb not null default '[]'::jsonb,
  platforms jsonb not null default '[]'::jsonb,
  forbidden_words text,
  cta_method text,
  cta_goal text,
  cta_keyword text,
  cta_strength text,
  cta_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  title text not null default '文字匯入資料',
  source_type text not null default 'manual_text' check (source_type in ('manual_text', 'url_text', 'file_text')),
  source_url text,
  summary text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  content text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.script_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'selected', 'filmed', 'published')),
  platform text,
  purpose text,
  script_style text,
  duration_seconds int,
  roles jsonb not null default '[]'::jsonb,
  tones jsonb not null default '[]'::jsonb,
  rehearsal_preview jsonb not null default '[]'::jsonb,
  real_lines jsonb not null default '[]'::jsonb,
  story_beats jsonb not null default '{}'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  quality_check jsonb not null default '{}'::jsonb,
  human_speech_check jsonb not null default '{}'::jsonb,
  publish_pack jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_message_id uuid references public.room_messages(id) on delete set null,
  stage text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  model text,
  status text not null default 'success' check (status in ('success', 'failed', 'partial')),
  error text,
  created_at timestamptz not null default now()
);
