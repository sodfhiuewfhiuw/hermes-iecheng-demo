create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.rooms enable row level security;
alter table public.room_messages enable row level security;
alter table public.room_state enable row level security;
alter table public.personas enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.memories enable row level security;
alter table public.script_drafts enable row level security;
alter table public.agent_runs enable row level security;

create policy "members can read workspaces" on public.workspaces
for select using (public.is_workspace_member(id));

create policy "owners can insert workspaces" on public.workspaces
for insert with check (owner_id = auth.uid());

create policy "members can read memberships" on public.workspace_members
for select using (public.is_workspace_member(workspace_id));

create policy "members can insert memberships" on public.workspace_members
for insert with check (user_id = auth.uid() or public.is_workspace_member(workspace_id));

create policy "members can read rooms" on public.rooms
for select using (public.is_workspace_member(workspace_id));

create policy "members can insert rooms" on public.rooms
for insert with check (public.is_workspace_member(workspace_id));

create policy "members can update rooms" on public.rooms
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "members can read messages" on public.room_messages
for select using (public.is_workspace_member(workspace_id));

create policy "members can insert messages" on public.room_messages
for insert with check (public.is_workspace_member(workspace_id));

create policy "members can read room state" on public.room_state
for select using (public.is_workspace_member(workspace_id));

create policy "members can insert room state" on public.room_state
for insert with check (public.is_workspace_member(workspace_id));

create policy "members can update room state" on public.room_state
for update using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "members can read personas" on public.personas
for select using (public.is_workspace_member(workspace_id));

create policy "members can write personas" on public.personas
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "members can read documents" on public.documents
for select using (public.is_workspace_member(workspace_id));

create policy "members can write documents" on public.documents
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "members can read chunks" on public.document_chunks
for select using (public.is_workspace_member(workspace_id));

create policy "members can write chunks" on public.document_chunks
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "members can read memories" on public.memories
for select using (public.is_workspace_member(workspace_id));

create policy "members can write memories" on public.memories
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "members can read scripts" on public.script_drafts
for select using (public.is_workspace_member(workspace_id));

create policy "members can write scripts" on public.script_drafts
for all using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "members can read agent runs" on public.agent_runs
for select using (public.is_workspace_member(workspace_id));

create policy "members can insert agent runs" on public.agent_runs
for insert with check (public.is_workspace_member(workspace_id));
