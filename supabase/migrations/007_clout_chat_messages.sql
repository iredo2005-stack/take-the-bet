-- ─────────────────────────────────────────────────────────────────────────────
-- CLOUT — Alpha Chat messages
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- (Depends on 006_clout_alpha_chats.sql already having run.)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.clout_chat_messages (
  id           uuid primary key default gen_random_uuid(),
  chat_id      uuid references public.clout_alpha_chats(id) on delete cascade not null,
  user_id      uuid references public.users(id) not null,
  message_text text not null check (char_length(message_text) between 1 and 500),
  created_at   timestamptz not null default now()
);
create index if not exists idx_clout_chat_messages_chat_created on public.clout_chat_messages(chat_id, created_at desc);
create index if not exists idx_clout_chat_messages_user on public.clout_chat_messages(user_id);

alter table public.clout_chat_messages enable row level security;
create policy "public_read_clout_chat_messages" on public.clout_chat_messages for select using (true);
-- No public insert policy — every write goes through clout_post_chat_message
-- (called with the service-role key), which is the only place membership is
-- actually checked before a row can be created.

-- ─────────────────────────────────────────────────────────────────────────────
-- Posting a message is check-and-insert in ONE atomic, row-locked statement —
-- not a check in the API route followed by a separate insert. Locking the
-- membership row for the duration means a boot sweep running at the exact
-- same instant either fully finishes first (and this call correctly sees
-- 'booted') or fully finishes after (and blocks until this insert commits,
-- then boots them for their *next* message) — there's no window where a
-- just-booted member can still slip a message through.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clout_post_chat_message(
  p_user_id uuid,
  p_chat_id uuid,
  p_message_text text
) returns public.clout_chat_messages
language plpgsql
as $$
declare
  v_member public.clout_chat_members;
  v_trimmed text;
  v_row public.clout_chat_messages;
begin
  v_trimmed := trim(p_message_text);
  if length(v_trimmed) = 0 then raise exception 'empty_message'; end if;
  if length(v_trimmed) > 500 then raise exception 'message_too_long'; end if;

  select * into v_member
    from public.clout_chat_members
    where chat_id = p_chat_id and user_id = p_user_id
    for update;

  if v_member is null or v_member.status <> 'active' then
    raise exception 'not_active_member';
  end if;

  insert into public.clout_chat_messages (chat_id, user_id, message_text)
  values (p_chat_id, p_user_id, v_trimmed)
  returning * into v_row;

  return v_row;
end;
$$;
