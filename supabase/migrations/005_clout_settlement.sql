-- ─────────────────────────────────────────────────────────────────────────────
-- CLOUT — Liquidation Engine + Final Pool Settlement Engine
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- (Depends on 004_clout_pools.sql already having run.)
--
-- Two-phase settlement: 'locked' is a REAL intermediate status, not cosmetic.
-- Fetching the final metric is an HTTP call to YouTube/Twitch/Twitter/Spotify,
-- which cannot happen inside Postgres — so a fast, frequent sweep flips a pool
-- open -> locked the instant its timer expires (blocking anything that assumes
-- "open"), and settlement itself (which needs that externally-fetched metric
-- in hand already) only ever proceeds from 'locked'. Both steps are still each
-- individually atomic and row-locked, so concurrent/duplicate cron ticks can
-- never double-process the same pool.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clout_pools drop constraint if exists clout_pools_status_check;
alter table public.clout_pools add constraint clout_pools_status_check
  check (status in ('open','locked','resolved_up','resolved_down','void'));

alter table public.clout_pool_positions
  add column if not exists insurance_refund_cents bigint;

-- ── Wallet audit trail — every clout_adjust_wallet call now logs one row ──────
create table if not exists public.wallet_ledger (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.users(id) not null,
  play_delta_cents bigint not null default 0,
  promo_delta_cents bigint not null default 0,
  reason           text not null,
  reference_table  text,
  reference_id     uuid,
  created_at       timestamptz not null default now()
);
create index if not exists idx_wallet_ledger_user on public.wallet_ledger(user_id, created_at desc);

alter table public.wallet_ledger enable row level security;
create policy "public_read_wallet_ledger" on public.wallet_ledger for select using (true);

-- Replaces the 4-arg version from 004 with a 7-arg one (reason + reference for
-- the audit trail). Existing callers that only pass the original 4 positional
-- args keep working unchanged — the new params are all defaulted — they'll
-- just log with reason='adjustment' until updated to pass something specific.
drop function if exists public.clout_adjust_wallet(uuid, bigint, bigint, boolean);

create or replace function public.clout_adjust_wallet(
  p_user_id uuid,
  p_play_delta_cents bigint,
  p_promo_delta_cents bigint,
  p_allow_negative boolean default false,
  p_reason text default 'adjustment',
  p_reference_table text default null,
  p_reference_id uuid default null
) returns public.wallets
language plpgsql
as $$
declare
  v_wallet public.wallets;
  v_new_play bigint;
  v_new_promo bigint;
begin
  perform public.clout_get_or_create_wallet(p_user_id);
  select * into v_wallet from public.wallets where user_id = p_user_id for update;

  v_new_play := v_wallet.play_balance_cents + p_play_delta_cents;
  v_new_promo := v_wallet.promo_bonus_balance_cents + p_promo_delta_cents;

  if not p_allow_negative and (v_new_play < 0 or v_new_promo < 0) then
    raise exception 'insufficient_balance';
  end if;

  update public.wallets
  set play_balance_cents = v_new_play, promo_bonus_balance_cents = v_new_promo
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.wallet_ledger (
    user_id, play_delta_cents, promo_delta_cents, reason, reference_table, reference_id
  ) values (
    p_user_id, p_play_delta_cents, p_promo_delta_cents, p_reason, p_reference_table, p_reference_id
  );

  return v_wallet;
end;
$$;

-- Same signature as 004 — CREATE OR REPLACE in place is fine. Only change is
-- passing specific reasons through to clout_adjust_wallet for a readable ledger.
create or replace function public.clout_place_position(
  p_user_id uuid,
  p_pool_id uuid,
  p_side text,
  p_margin_cents bigint,
  p_leverage integer,
  p_buy_insurance boolean,
  p_client_request_id text
) returns public.clout_pool_positions
language plpgsql
as $$
declare
  v_pool public.clout_pools;
  v_wallet public.wallets;
  v_notional_cents bigint;
  v_premium_cents bigint;
  v_total_charge_cents bigint;
  v_from_play bigint;
  v_from_promo bigint;
  v_row public.clout_pool_positions;
begin
  if p_side not in ('up','down') then raise exception 'invalid_side'; end if;
  if p_leverage not in (1,5,10) then raise exception 'invalid_leverage'; end if;
  if p_margin_cents <= 0 then raise exception 'invalid_margin'; end if;

  select * into v_pool from public.clout_pools where id = p_pool_id for update;
  if v_pool is null then raise exception 'pool_not_found'; end if;
  if v_pool.status <> 'open' then raise exception 'pool_closed'; end if;
  if now() >= v_pool.expires_at then raise exception 'pool_expired'; end if;

  v_notional_cents := p_margin_cents * p_leverage;
  v_premium_cents := case when p_buy_insurance then round(p_margin_cents * 0.05) else 0 end;
  v_total_charge_cents := p_margin_cents + v_premium_cents;

  perform public.clout_get_or_create_wallet(p_user_id);
  select * into v_wallet from public.wallets where user_id = p_user_id for update;

  v_from_play := least(v_wallet.play_balance_cents, v_total_charge_cents);
  v_from_promo := v_total_charge_cents - v_from_play;

  if v_from_promo > v_wallet.promo_bonus_balance_cents then
    raise exception 'insufficient_balance';
  end if;

  perform public.clout_adjust_wallet(
    p_user_id, -v_from_play, -v_from_promo, false,
    'position_open_margin', 'clout_pool_positions', null
  );

  insert into public.clout_pool_positions (
    pool_id, user_id, side, leverage, margin_cents, notional_cents,
    funded_from_bonus_cents, insurance_purchased, insurance_premium_cents,
    status, client_request_id
  ) values (
    p_pool_id, p_user_id, p_side, p_leverage, p_margin_cents, v_notional_cents,
    v_from_promo, p_buy_insurance, v_premium_cents,
    'open', p_client_request_id
  ) returning * into v_row;

  if p_side = 'up' then
    update public.clout_pools set up_pool_cents = up_pool_cents + p_margin_cents where id = p_pool_id;
  else
    update public.clout_pools set down_pool_cents = down_pool_cents + p_margin_cents where id = p_pool_id;
  end if;

  if v_premium_cents > 0 then
    insert into public.clout_platform_ledger (amount_cents, source, reference_table, reference_id)
    values (v_premium_cents, 'insurance_premium', 'clout_pool_positions', v_row.id);
  end if;

  return v_row;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 of settlement: flip every pool whose timer has expired from
-- 'open' to 'locked'. Cheap, frequent, and safe to call as often as you like —
-- the WHERE status='open' makes each row transition happen at most once.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clout_lock_expired_pools()
returns setof uuid
language plpgsql
as $$
begin
  return query
    update public.clout_pools
    set status = 'locked'
    where status = 'open' and expires_at <= now()
    returning id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Automated Liquidation Engine
--
-- Only leveraged positions (5x/10x) are subject to liquidation — a "Regular"
-- (1x) position has no knockout risk and simply rides to settlement, which is
-- the whole point of offering a no-leverage mode. Liquidation forfeits the
-- margin (it already stayed in up_pool_cents/down_pool_cents — nothing to
-- subtract there) and excludes the position from clout_calculate_live_payout
-- and clout_settle_pool's payout math (both only ever sum status='open').
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clout_check_liquidations(p_pool_id uuid)
returns table(position_id uuid, liq_user_id uuid, side text, insurance_refund_cents bigint)
language plpgsql
as $$
declare
  v_pool public.clout_pools;
  v_pos record;
  v_should_liquidate boolean;
  v_refund bigint;
begin
  select * into v_pool from public.clout_pools where id = p_pool_id for update;
  if v_pool is null or v_pool.status <> 'open' then
    return;
  end if;

  for v_pos in
    select * from public.clout_pool_positions
    where pool_id = p_pool_id and status = 'open' and leverage > 1
    for update
  loop
    v_should_liquidate := false;

    if v_pos.side = 'up' then
      -- Adverse move for an UP bet: metric falls trigger_ratio below baseline.
      if v_pool.current_metric <= v_pool.baseline_metric * (1 - v_pos.liquidation_trigger_ratio) then
        v_should_liquidate := true;
      end if;
    else
      -- Adverse move for a DOWN bet: metric rises trigger_ratio above baseline.
      if v_pool.current_metric >= v_pool.baseline_metric * (1 + v_pos.liquidation_trigger_ratio) then
        v_should_liquidate := true;
      end if;
    end if;

    if not v_should_liquidate then
      continue;
    end if;

    v_refund := 0;
    if v_pos.insurance_purchased then
      v_refund := round(v_pos.margin_cents * 0.5);
      perform public.clout_adjust_wallet(
        v_pos.user_id, 0, v_refund, true,
        'insurance_liquidation_refund', 'clout_pool_positions', v_pos.id
      );
    end if;

    update public.clout_pool_positions
    set status = 'liquidated', payout_cents = 0, insurance_refund_cents = v_refund, liquidated_at = now()
    where id = v_pos.id;

    position_id := v_pos.id;
    liq_user_id := v_pos.user_id;
    side := v_pos.side;
    insurance_refund_cents := v_refund;
    return next;
  end loop;

  return;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Final Pool Resolution Engine
--
-- p_final_metric is supplied by the caller (fetched from the platform's API —
-- an HTTP call that can't happen inside Postgres); if omitted, falls back to
-- whatever current_metric was last recorded, so this stays callable even
-- before a live oracle poller is wired up.
--
-- Void whenever there's no fair way to pick a winner: one side never got any
-- volume, the final metric landed exactly on the baseline (a genuine push,
-- neither "beat" nor "dropped below" it), or — the position-level edge case —
-- every position on the winning side got liquidated earlier and there's no
-- surviving claimant even though that side "won." Void refunds every
-- currently-'open' position on both sides; anything already 'liquidated'
-- stays liquidated, since that outcome was already final the moment it
-- happened and a later void doesn't reach back and undo it.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clout_settle_pool(
  p_pool_id uuid,
  p_final_metric numeric default null
) returns public.clout_pools
language plpgsql
as $$
declare
  v_pool public.clout_pools;
  v_final numeric;
  v_total_pot bigint;
  v_creator_cents bigint;
  v_platform_cents bigint;
  v_prize_pool bigint;
  v_outcome_up boolean;
  v_winning_side text;
  v_void boolean := false;
  v_void_reason text;
  v_winning_notional bigint;
  v_distributed bigint := 0;
  v_dust bigint;
  v_pos record;
  v_payout bigint;
begin
  select * into v_pool from public.clout_pools where id = p_pool_id for update;
  if v_pool is null then raise exception 'pool_not_found'; end if;
  if v_pool.status <> 'locked' then return v_pool; end if; -- idempotent — not locked, or already settled

  v_final := coalesce(p_final_metric, v_pool.current_metric);
  v_total_pot := v_pool.up_pool_cents + v_pool.down_pool_cents;

  if v_pool.up_pool_cents = 0 or v_pool.down_pool_cents = 0 then
    v_void := true;
    v_void_reason := 'one_sided_pool_zero_volume';
  elsif v_final = v_pool.baseline_metric then
    v_void := true;
    v_void_reason := 'final_metric_tied_baseline';
  else
    v_outcome_up := v_final > v_pool.baseline_metric;
    v_winning_side := case when v_outcome_up then 'up' else 'down' end;

    select coalesce(sum(notional_cents), 0) into v_winning_notional
      from public.clout_pool_positions
      where pool_id = p_pool_id and side = v_winning_side and status = 'open';

    if v_winning_notional = 0 then
      v_void := true;
      v_void_reason := 'no_surviving_positions_on_winning_side';
    end if;
  end if;

  if v_void then
    for v_pos in
      select * from public.clout_pool_positions where pool_id = p_pool_id and status = 'open' for update
    loop
      perform public.clout_adjust_wallet(
        v_pos.user_id, v_pos.margin_cents, 0, true,
        'pool_void_refund', 'clout_pool_positions', v_pos.id
      );
      update public.clout_pool_positions
      set status = 'void', payout_cents = v_pos.margin_cents, settled_at = now()
      where id = v_pos.id;
    end loop;

    update public.clout_pools
    set status = 'void', final_metric = v_final, void_reason = v_void_reason, resolved_at = now()
    where id = p_pool_id
    returning * into v_pool;

    return v_pool;
  end if;

  -- Guaranteed rake, split from creator_share_bps / platform_share_bps
  -- directly (not from rake_bps) so prize_pool is always exactly whatever's
  -- left after what was actually routed out — no separate figure to drift
  -- out of sync with the two shares that actually move money.
  v_creator_cents := round(v_total_pot * v_pool.creator_share_bps / 10000.0);
  v_platform_cents := round(v_total_pot * v_pool.platform_share_bps / 10000.0);
  v_prize_pool := v_total_pot - v_creator_cents - v_platform_cents;

  for v_pos in
    select * from public.clout_pool_positions
    where pool_id = p_pool_id and side = v_winning_side and status = 'open'
    for update
  loop
    -- Multiply first, divide once — see clout_calculate_live_payout for why
    -- dividing notional/winning_notional before multiplying can shave off a cent.
    v_payout := floor((v_prize_pool * v_pos.notional_cents::numeric) / v_winning_notional);
    v_distributed := v_distributed + v_payout;

    perform public.clout_adjust_wallet(
      v_pos.user_id, v_payout, 0, true,
      'pool_win_payout', 'clout_pool_positions', v_pos.id
    );

    update public.clout_pool_positions
    set status = 'won', payout_cents = v_payout, settled_at = now()
    where id = v_pos.id;
  end loop;

  update public.clout_pool_positions
  set status = 'lost', payout_cents = 0, settled_at = now()
  where pool_id = p_pool_id and side <> v_winning_side and status = 'open';

  v_dust := v_prize_pool - v_distributed;

  if v_creator_cents > 0 then
    insert into public.creator_earnings (creator_id, pool_id, amount_cents, source)
    values (v_pool.creator_id, p_pool_id, v_creator_cents, 'pool_rake_share');
  end if;
  if v_platform_cents > 0 then
    insert into public.clout_platform_ledger (amount_cents, source, reference_table, reference_id)
    values (v_platform_cents, 'pool_platform_share', 'clout_pools', p_pool_id);
  end if;
  if v_dust > 0 then
    insert into public.clout_platform_ledger (amount_cents, source, reference_table, reference_id)
    values (v_dust, 'pool_rounding_dust', 'clout_pools', p_pool_id);
  end if;

  update public.clout_pools
  set status = case when v_outcome_up then 'resolved_up' else 'resolved_down' end,
      final_metric = v_final, resolved_at = now()
  where id = p_pool_id
  returning * into v_pool;

  return v_pool;
end;
$$;
