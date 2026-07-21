-- ─────────────────────────────────────────────────────────────────────────────
-- Take The Bet — Take-Profit/Stop-Loss + Tiered Chatrooms
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- (Depends on 002_leverage_and_prediction_engine.sql already having run.)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.leveraged_positions
  add column if not exists take_profit_price numeric(14,4),
  add column if not exists stop_loss_price   numeric(14,4),
  add column if not exists close_reason      text;

-- finalize_close_leveraged_position originally took a boolean
-- (p_force_liquidate) that only distinguished "liquidation" from "everything
-- else," and required 'everything else' to already be in status
-- 'pending_close'. That's correct for a user-initiated close (which always
-- goes through the pending_close delay window) but wrong for TP/SL, which —
-- like liquidation — is a system-triggered close firing immediately from
-- 'open' with no delay. Replacing the boolean with an explicit close-kind so
-- all three paths (user_close / liquidation / take_profit / stop_loss) are
-- validated against the right starting status instead of being conflated.
drop function if exists public.finalize_close_leveraged_position(uuid, integer, boolean);

create or replace function public.finalize_close_leveraged_position(
  p_position_id uuid, p_spread_bps integer, p_close_kind text default 'user_close'
) returns public.leveraged_positions
language plpgsql
as $$
declare
  v_pos public.leveraged_positions;
  v_price numeric;
  v_pnl_cents bigint;
  v_close_fee_cents bigint;
  v_equity_cents bigint;
  v_new_status text;
begin
  if p_close_kind not in ('user_close','liquidation','take_profit','stop_loss') then
    raise exception 'invalid_close_kind';
  end if;

  select * into v_pos from public.leveraged_positions where id = p_position_id for update;
  if v_pos is null then raise exception 'position_not_found'; end if;
  if v_pos.status not in ('pending_close','open') then return v_pos; end if; -- idempotent / already closed

  if p_close_kind = 'user_close' and v_pos.status <> 'pending_close' then
    raise exception 'not_pending_close';
  end if;
  if p_close_kind <> 'user_close' and v_pos.status <> 'open' then
    raise exception 'not_open';
  end if;

  select index_price into v_price from public.creators where id = v_pos.creator_id;

  v_pnl_cents := round(
    v_pos.notional_cents *
    (case when v_pos.side = 'long' then 1 else -1 end) *
    ((v_price - v_pos.entry_index_price) / v_pos.entry_index_price)
  );
  -- max loss is the collateral — never below zero for the user
  v_pnl_cents := greatest(v_pnl_cents, -v_pos.collateral_cents);

  v_close_fee_cents := round(v_pos.notional_cents * p_spread_bps / 10000.0);
  v_equity_cents := greatest(0, v_pos.collateral_cents + v_pnl_cents - v_close_fee_cents);

  perform public.adjust_user_balance_cents(v_pos.user_id, v_equity_cents, true);

  insert into public.admin_wallet_ledger (amount_cents, source, reference_table, reference_id)
  values (v_close_fee_cents, 'leverage_close_spread', 'leveraged_positions', v_pos.id);

  v_new_status := case when p_close_kind = 'liquidation' then 'liquidated' else 'closed' end;

  update public.leveraged_positions
  set status = v_new_status, exit_index_price = v_price, pnl_cents = v_pnl_cents - v_close_fee_cents,
      close_fee_cents = v_close_fee_cents, close_reason = p_close_kind, closed_at = now()
  where id = p_position_id
  returning * into v_pos;

  return v_pos;
end;
$$;

-- Same signature as before (uuid, integer) — CREATE OR REPLACE in place is
-- fine here, just updated to pass the new close-kind string.
create or replace function public.check_liquidation(p_position_id uuid, p_spread_bps integer)
returns boolean
language plpgsql
as $$
declare
  v_pos public.leveraged_positions;
  v_price numeric;
  v_unrealized_cents bigint;
begin
  select * into v_pos from public.leveraged_positions where id = p_position_id for update;
  if v_pos is null or v_pos.status <> 'open' then return false; end if;

  select index_price into v_price from public.creators where id = v_pos.creator_id;

  v_unrealized_cents := round(
    v_pos.notional_cents *
    (case when v_pos.side = 'long' then 1 else -1 end) *
    ((v_price - v_pos.entry_index_price) / v_pos.entry_index_price)
  );

  if v_pos.collateral_cents + v_unrealized_cents <= v_pos.maintenance_margin_cents then
    perform public.finalize_close_leveraged_position(p_position_id, p_spread_bps, 'liquidation');
    return true;
  end if;

  return false;
end;
$$;

-- Recreate request_open_leveraged_position with two new trailing params.
-- Drop the old 9-arg signature first so we don't leave a stale overload
-- lying around next to the new 11-arg one.
drop function if exists public.request_open_leveraged_position(
  uuid, uuid, text, integer, bigint, integer, integer, timestamptz, text
);

create or replace function public.request_open_leveraged_position(
  p_user_id uuid,
  p_creator_id uuid,
  p_side text,
  p_leverage integer,
  p_collateral_cents bigint,
  p_spread_bps integer,
  p_maintenance_ratio_bps integer,
  p_execute_at timestamptz,
  p_client_request_id text,
  p_take_profit_price numeric default null,
  p_stop_loss_price numeric default null
) returns public.leveraged_positions
language plpgsql
as $$
declare
  v_notional_cents bigint;
  v_open_fee_cents bigint;
  v_maintenance_cents bigint;
  v_row public.leveraged_positions;
begin
  if p_side not in ('long','short') then raise exception 'invalid_side'; end if;
  if p_leverage not in (3,5) then raise exception 'invalid_leverage'; end if;
  if p_collateral_cents <= 0 then raise exception 'invalid_collateral'; end if;
  if p_take_profit_price is not null and p_stop_loss_price is not null and p_take_profit_price = p_stop_loss_price then
    raise exception 'invalid_tp_sl';
  end if;

  v_notional_cents := p_collateral_cents * p_leverage;
  v_open_fee_cents := round(v_notional_cents * p_spread_bps / 10000.0);
  v_maintenance_cents := round(p_collateral_cents * p_maintenance_ratio_bps / 10000.0);

  -- Reserve collateral + spread fee now (this call is itself the double-spend guard).
  perform public.adjust_user_balance_cents(p_user_id, -(p_collateral_cents + v_open_fee_cents), false);

  insert into public.leveraged_positions (
    user_id, creator_id, side, leverage, collateral_cents, notional_cents,
    maintenance_margin_cents, open_fee_cents, status, execute_at, client_request_id,
    take_profit_price, stop_loss_price
  ) values (
    p_user_id, p_creator_id, p_side, p_leverage, p_collateral_cents, v_notional_cents,
    v_maintenance_cents, v_open_fee_cents, 'pending', p_execute_at, p_client_request_id,
    p_take_profit_price, p_stop_loss_price
  ) returning * into v_row;

  insert into public.admin_wallet_ledger (amount_cents, source, reference_table, reference_id)
  values (v_open_fee_cents, 'leverage_open_spread', 'leveraged_positions', v_row.id);

  return v_row;
end;
$$;

-- Take-Profit / Stop-Loss watcher — shares the same close path (and 1% exit
-- spread) as a manual close, since it's still a normal exit, not a margin call.
create or replace function public.check_tp_sl(p_position_id uuid, p_spread_bps integer)
returns text
language plpgsql
as $$
declare
  v_pos public.leveraged_positions;
  v_price numeric;
  v_triggered text;
begin
  select * into v_pos from public.leveraged_positions where id = p_position_id for update;
  if v_pos is null or v_pos.status <> 'open' then return null; end if;
  if v_pos.take_profit_price is null and v_pos.stop_loss_price is null then return null; end if;

  select index_price into v_price from public.creators where id = v_pos.creator_id;

  if v_pos.side = 'long' then
    if v_pos.take_profit_price is not null and v_price >= v_pos.take_profit_price then
      v_triggered := 'take_profit';
    elsif v_pos.stop_loss_price is not null and v_price <= v_pos.stop_loss_price then
      v_triggered := 'stop_loss';
    end if;
  else
    if v_pos.take_profit_price is not null and v_price <= v_pos.take_profit_price then
      v_triggered := 'take_profit';
    elsif v_pos.stop_loss_price is not null and v_price >= v_pos.stop_loss_price then
      v_triggered := 'stop_loss';
    end if;
  end if;

  if v_triggered is not null then
    perform public.finalize_close_leveraged_position(p_position_id, p_spread_bps, v_triggered);
  end if;

  return v_triggered;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tiered chatrooms (Bronze/Silver/Gold/Alpha)
--
-- Gating happens at the WRITE (POST /api/chat/[tier], which verifies the
-- caller's signed tier token) and at the UI layer (the lock overlay simply
-- never renders/fetches a room's messages for an unqualified user). Reads
-- are permissive at the DB level — same "public read, app-layer gating"
-- model already used everywhere else in this schema (see 001's comment on
-- users/holdings/transactions) — so Supabase Realtime can push new rows to
-- subscribed clients without a custom Postgres-Auth JWT setup.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  tier         text not null check (tier in ('bronze','silver','gold','alpha')),
  user_id      uuid references public.users(id) not null,
  display_name text not null,
  body         text not null check (char_length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);
create index if not exists idx_chat_messages_tier_ts on public.chat_messages(tier, created_at desc);

alter table public.chat_messages enable row level security;
create policy "public_read_chat_messages" on public.chat_messages for select using (true);

do $$
begin
  execute 'alter publication supabase_realtime add table public.chat_messages';
exception when others then
  raise notice 'Could not auto-attach chat_messages to supabase_realtime: %', sqlerrm;
end $$;
