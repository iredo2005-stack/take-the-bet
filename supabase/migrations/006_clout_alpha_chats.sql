-- ─────────────────────────────────────────────────────────────────────────────
-- CLOUT — Alpha Chats: rolling-ROI/volume gated rooms, with automatic boot
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- (Depends on 004_clout_pools.sql / 005_clout_settlement.sql already having run.)
--
-- Gating is computed entirely from our own ledger (clout_pool_positions),
-- not on-chain proof or wallet signatures — this is the simulated Phase 1
-- beta, so "your track record" means your realized settlement history here,
-- not a wallet balance anyone could just fund to fake their way in.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.clout_alpha_chats (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  min_roi_bps      integer not null default 0,   -- e.g. 2000 = 20% net profit over the trailing window
  min_volume_cents bigint not null default 0,    -- minimum trailing trading volume required
  max_members      integer,                       -- null = unlimited
  created_at       timestamptz not null default now()
);

create table if not exists public.clout_chat_members (
  id                uuid primary key default gen_random_uuid(),
  chat_id           uuid references public.clout_alpha_chats(id) on delete cascade not null,
  user_id           uuid references public.users(id) not null,
  status            text not null default 'active' check (status in ('active','booted')),
  joined_at         timestamptz not null default now(),
  last_verified_at  timestamptz not null default now(),
  booted_at         timestamptz,
  boot_reason       text,
  unique (chat_id, user_id)
);
create index if not exists idx_chat_members_chat_status on public.clout_chat_members(chat_id, status);
create index if not exists idx_chat_members_user on public.clout_chat_members(user_id);

alter table public.clout_alpha_chats enable row level security;
alter table public.clout_chat_members enable row level security;
create policy "public_read_clout_alpha_chats"  on public.clout_alpha_chats  for select using (true);
create policy "public_read_clout_chat_members" on public.clout_chat_members for select using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rolling 30-day performance, computed straight from clout_pool_positions:
--   volume_cents    = sum of margin on every position OPENED in the window
--                      (whether it's settled yet or not — "how much you've
--                      been trading")
--   invested_cents  = sum of margin on positions SETTLED in the window
--   returned_cents  = sum of payout_cents on those same settled positions
--   roi_bps         = net profit ratio: (returned - invested) / invested,
--                      in basis points, matching "2000 bps = 20% profit."
-- A void position refunds payout_cents = margin_cents, so it nets to exactly
-- 0 bps of its own accord — it's neither a win nor a loss, without needing a
-- special case here.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clout_calculate_rolling_stats(p_user_id uuid, p_days integer default 30)
returns table(roi_bps integer, volume_cents bigint, invested_cents bigint, returned_cents bigint)
language plpgsql
stable
as $$
declare
  v_since timestamptz := now() - make_interval(days => p_days);
  v_volume bigint;
  v_invested bigint;
  v_returned bigint;
begin
  select coalesce(sum(margin_cents), 0) into v_volume
    from public.clout_pool_positions
    where user_id = p_user_id and created_at >= v_since;

  select coalesce(sum(margin_cents), 0), coalesce(sum(payout_cents), 0)
    into v_invested, v_returned
    from public.clout_pool_positions
    where user_id = p_user_id
      and status in ('won','lost','liquidated','void')
      and coalesce(settled_at, liquidated_at) >= v_since;

  volume_cents := v_volume;
  invested_cents := v_invested;
  returned_cents := v_returned;
  roi_bps := case
    when v_invested > 0 then round(((v_returned - v_invested)::numeric / v_invested) * 10000)
    else 0
  end;

  return next;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants (or re-activates) membership if the caller currently clears the
-- room's ROI + volume bar and there's room. Row-locks the chat so a burst of
-- simultaneous joins can't overshoot max_members. Raises a specific,
-- UI-friendly error rather than a generic failure.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clout_grant_chat_access(p_user_id uuid, p_chat_id uuid)
returns public.clout_chat_members
language plpgsql
as $$
declare
  v_chat public.clout_alpha_chats;
  v_stats record;
  v_active_count integer;
  v_member public.clout_chat_members;
begin
  select * into v_chat from public.clout_alpha_chats where id = p_chat_id for update;
  if v_chat is null then raise exception 'chat_not_found'; end if;

  select * into v_stats from public.clout_calculate_rolling_stats(p_user_id, 30);

  if v_stats.roi_bps < v_chat.min_roi_bps then
    raise exception 'roi_below_threshold';
  end if;
  if v_stats.volume_cents < v_chat.min_volume_cents then
    raise exception 'volume_below_threshold';
  end if;

  select count(*) into v_active_count
    from public.clout_chat_members
    where chat_id = p_chat_id and status = 'active' and user_id <> p_user_id;

  if v_chat.max_members is not null and v_active_count >= v_chat.max_members then
    raise exception 'chat_full';
  end if;

  insert into public.clout_chat_members (chat_id, user_id, status, last_verified_at)
  values (p_chat_id, p_user_id, 'active', now())
  on conflict (chat_id, user_id) do update
    set status = 'active', last_verified_at = now(), booted_at = null, boot_reason = null
  returning * into v_member;

  return v_member;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- The Boot Mechanism: re-checks every active member against their room's
-- current bar and revokes anyone who's fallen below it. Meant to run on a
-- schedule (e.g. hourly) — "stay elite or get swept out" is the whole point.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clout_sweep_chat_boots()
returns table(chat_id uuid, user_id uuid, boot_reason text)
language plpgsql
as $$
declare
  v_member record;
  v_stats record;
  v_chat public.clout_alpha_chats;
  v_reason text;
begin
  for v_member in
    select m.id, m.chat_id, m.user_id
    from public.clout_chat_members m
    where m.status = 'active'
    for update of m
  loop
    select * into v_chat from public.clout_alpha_chats where id = v_member.chat_id;
    if v_chat is null then continue; end if;

    select * into v_stats from public.clout_calculate_rolling_stats(v_member.user_id, 30);

    v_reason := null;
    if v_stats.roi_bps < v_chat.min_roi_bps then
      v_reason := 'roi_below_threshold';
    elsif v_stats.volume_cents < v_chat.min_volume_cents then
      v_reason := 'volume_below_threshold';
    end if;

    if v_reason is not null then
      update public.clout_chat_members
      set status = 'booted', booted_at = now(), boot_reason = v_reason
      where id = v_member.id;

      chat_id := v_member.chat_id;
      user_id := v_member.user_id;
      boot_reason := v_reason;
      return next;
    else
      update public.clout_chat_members set last_verified_at = now() where id = v_member.id;
    end if;
  end loop;

  return;
end;
$$;
