-- Companion to schema.ts: functions, triggers and RLS policies.
-- Idempotent — safe to run on every migrate. Applied after drizzle migrations.

-- ---------------------------------------------------------------------------
-- Helper: is the current user an admin? SECURITY DEFINER bypasses RLS on
-- profiles so the policies below don't recurse.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Helper: may the current user access this agent? True for the owner, any
-- admin, or a user explicitly invited to the agent (agent_members).
-- ---------------------------------------------------------------------------
create or replace function public.can_access_agent(a_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.agents a
    where a.id = a_id
      and (
        a.owner_id = auth.uid()
        or public.is_admin()
        or exists (
          select 1 from public.agent_members m
          where m.agent_id = a.id and m.user_id = auth.uid()
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Auto-create a profile when an auth user is created. The FIRST user to sign
-- up becomes admin (bootstrap); everyone after is a regular user (invited).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_user boolean;
begin
  select not exists (select 1 from public.profiles where role = 'admin')
    into first_user;

  insert into public.profiles (id, role, name)
  values (
    new.id,
    case when first_user then 'admin'::public.role else 'user'::public.role end,
    coalesce(new.raw_user_meta_data ->> 'name', null)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS policies. Target the `authenticated` role (supabase-js with a user JWT).
-- The worker connects as `postgres` and bypasses RLS entirely.
-- ---------------------------------------------------------------------------

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- agents --------------------------------------------------------------------
drop policy if exists agents_select on public.agents;
create policy agents_select on public.agents
  for select to authenticated
  using (public.can_access_agent(id));

drop policy if exists agents_insert on public.agents;
create policy agents_insert on public.agents
  for insert to authenticated
  with check (owner_id = auth.uid());

-- Members may edit the agent, but only owner/admin may delete it.
drop policy if exists agents_update on public.agents;
create policy agents_update on public.agents
  for update to authenticated
  using (public.can_access_agent(id))
  with check (public.can_access_agent(id));

drop policy if exists agents_delete on public.agents;
create policy agents_delete on public.agents
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- agent_members -------------------------------------------------------------
-- Anyone with access to the agent can see who else has access; only the owner
-- or an admin can add or remove members.
drop policy if exists agent_members_select on public.agent_members;
create policy agent_members_select on public.agent_members
  for select to authenticated
  using (public.can_access_agent(agent_id));

drop policy if exists agent_members_write on public.agent_members;
create policy agent_members_write on public.agent_members
  for all to authenticated
  using (
    exists (
      select 1 from public.agents a
      where a.id = agent_members.agent_id
        and (a.owner_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.agents a
      where a.id = agent_members.agent_id
        and (a.owner_id = auth.uid() or public.is_admin())
    )
  );

-- contacts ------------------------------------------------------------------
drop policy if exists contacts_all on public.contacts;
create policy contacts_all on public.contacts
  for all to authenticated
  using (public.can_access_agent(contacts.agent_id))
  with check (public.can_access_agent(contacts.agent_id));

-- agent_documents -----------------------------------------------------------
drop policy if exists agent_documents_all on public.agent_documents;
create policy agent_documents_all on public.agent_documents
  for all to authenticated
  using (public.can_access_agent(agent_documents.agent_id))
  with check (public.can_access_agent(agent_documents.agent_id));

-- agent_document_chunks -----------------------------------------------------
drop policy if exists agent_document_chunks_all on public.agent_document_chunks;
create policy agent_document_chunks_all on public.agent_document_chunks
  for all to authenticated
  using (public.can_access_agent(agent_document_chunks.agent_id))
  with check (public.can_access_agent(agent_document_chunks.agent_id));

-- conversations -------------------------------------------------------------
drop policy if exists conversations_all on public.conversations;
create policy conversations_all on public.conversations
  for all to authenticated
  using (public.can_access_agent(conversations.agent_id))
  with check (public.can_access_agent(conversations.agent_id));

-- messages ------------------------------------------------------------------
drop policy if exists messages_all on public.messages;
create policy messages_all on public.messages
  for all to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.can_access_agent(c.agent_id)
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and public.can_access_agent(c.agent_id)
    )
  );
