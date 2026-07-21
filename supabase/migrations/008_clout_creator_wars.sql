-- ─────────────────────────────────────────────────────────────────────────────
-- CLOUT — Creator Wars (PvP pools) + embedded live-stream asset routing
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- (Depends on 004-007 already having run.)
--
-- War Pools reuse the existing side='up'/'down' position model with ZERO
-- changes: "UP" already just means "the side that gets paid if [condition]
-- is true" — for a War Pool that condition is "Creator A beat Creator B,"
-- for a single-creator pool it's "the metric beat the baseline." Same
-- payout math (clout_calculate_live_payout, clout_place_position) already
-- works unchanged for both, since it never looks at what the metric means,
-- only at pool cash and notional weight. The only real work is teaching
-- clout_settle_pool a second way to determine a winner and a second way to
-- split the rake.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clout_pools
  add column if not exists pool_type            text not null default 'single' check (pool_type in ('single','war')),
  add column if not exists creator_a_id          uuid references public.creators(id),
  add column if not exists creator_b_id          uuid references public.creators(id),
  add column if not exists embed_platform_a      text check (embed_platform_a in ('youtube','twitch')),
  add column if not exists embed_channel_id_a    text,
  add column if not exists embed_platform_b      text check (embed_platform_b in ('youtube','twitch')),
  add column if not exists embed_channel_id_b    text,
  add column if not exists final_metric_a        numeric,
  add column if not exists final_metric_b        numeric,
  add column if not exists current_metric_a      numeric,
  add column if not exists current_metric_b      numeric,
  add column if not exists creator_a_share_bps   integer not null default 500, -- temporary — dropped below
  add column if not exists creator_b_share_bps   integer not null default 250; -- temporary — dropped below

-- Migrate the legacy single-creator columns into their _a equivalents, then
-- retire them — every pool (single or war) now addresses its creator(s) via
-- creator_a_id/creator_a_share_bps (+ creator_b_* for war pools), so there's
-- one naming scheme, not two that could drift out of sync with each other.
update public.clout_pools set creator_a_id = creator_id where creator_a_id is null and creator_id is not null;
update public.clout_pools set creator_a_share_bps = creator_share_bps where creator_share_bps is not null;

-- creator_a_share_bps means "the creator's full 5% share" for a single pool
-- but "Creator A's 2.5% half" for a War Pool — one column, two correct
-- values depending on pool_type, which a single static column DEFAULT can
-- never express (Postgres defaults can't look at sibling columns). A local
-- Postgres test caught exactly this: a War Pool created without an explicit
-- override silently took the single-pool default and ended up with a 12.5%
-- rake instead of 10%. Dropping the default entirely forces every insert
-- path — the API route or a direct admin/bot SQL insert — to state the
-- value explicitly, so the mistake fails loudly (NOT NULL violation)
-- instead of silently miscalculating.
alter table public.clout_pools alter column creator_a_share_bps drop default;
alter table public.clout_pools alter column creator_b_share_bps drop default;

alter table public.clout_pools drop constraint if exists clout_pools_rake_bps_check;
alter table public.clout_pools add constraint clout_pools_rake_bps_check
  check (platform_share_bps + creator_a_share_bps + creator_b_share_bps between 0 and 10000);

alter table public.clout_pools drop constraint if exists clout_pools_creator_id_fkey;
alter table public.clout_pools drop column if exists creator_id;
alter table public.clout_pools drop column if exists creator_share_bps;

alter table public.clout_pools drop constraint if exists clout_pools_type_creators_check;
alter table public.clout_pools add constraint clout_pools_type_creators_check check (
  (pool_type = 'single' and creator_a_id is not null and creator_b_id is null)
  or
  (pool_type = 'war' and creator_a_id is not null and creator_b_id is not null and creator_a_id <> creator_b_id)
);

comment on column public.clout_pools.creator_a_share_bps is
  'Single pools: the creator''s full 5% rake share (formerly creator_share_bps). War pools: Creator A''s 2.5% half.';
comment on column public.clout_pools.creator_b_share_bps is
  'War pools only: Creator B''s 2.5% half of the rake. Unused (ignored) for single pools.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Liquidation currently only applies to single pools. Head-to-head "20%
-- adverse move" doesn't have a defined meaning yet for a War Pool (20% of
-- what — the gap between A and B? their ratio? their combined total?) —
-- rather than guess at a real-money-shaped mechanic, War Pool leveraged
-- positions simply ride to settlement uncapped for now. Flagging this
-- explicitly rather than silently applying single-pool math to a shape it
-- wasn't designed for.
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
  if v_pool.pool_type <> 'single' then
    return; -- War Pool liquidation math isn't defined yet — see comment above.
  end if;

  for v_pos in
    select * from public.clout_pool_positions
    where pool_id = p_pool_id and status = 'open' and leverage > 1
    for update
  loop
    v_should_liquidate := false;

    if v_pos.side = 'up' then
      if v_pool.current_metric <= v_pool.baseline_metric * (1 - v_pos.liquidation_trigger_ratio) then
        v_should_liquidate := true;
      end if;
    else
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
-- Settlement — now takes final_metric_a and (for War Pools) final_metric_b.
-- Single pools ignore final_metric_b entirely and behave exactly as before
-- (final_metric_a vs baseline_metric). War Pools compare final_metric_a
-- directly against final_metric_b — "UP" wins when Creator A's number is
-- bigger, "DOWN" wins when Creator B's is. Tie = void, same reasoning as the
-- single-pool "landed exactly on the baseline" push.
--
-- Signature changed from (uuid, numeric) to (uuid, numeric, numeric) — drop
-- the old 2-arg version first so there's no stale overload left behind.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.clout_settle_pool(uuid, numeric);

create or replace function public.clout_settle_pool(
  p_pool_id uuid,
  p_final_metric_a numeric default null,
  p_final_metric_b numeric default null
) returns public.clout_pools
language plpgsql
as $$
declare
  v_pool public.clout_pools;
  v_final_a numeric;
  v_final_b numeric;
  v_total_pot bigint;
  v_creator_a_cents bigint := 0;
  v_creator_b_cents bigint := 0;
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
  if v_pool.status <> 'locked' then return v_pool; end if; -- idempotent

  v_total_pot := v_pool.up_pool_cents + v_pool.down_pool_cents;

  if v_pool.pool_type = 'war' then
    v_final_a := coalesce(p_final_metric_a, v_pool.current_metric_a);
    v_final_b := coalesce(p_final_metric_b, v_pool.current_metric_b);

    if v_pool.up_pool_cents = 0 or v_pool.down_pool_cents = 0 then
      v_void := true;
      v_void_reason := 'one_sided_pool_zero_volume';
    elsif v_final_a = v_final_b then
      v_void := true;
      v_void_reason := 'creators_tied';
    else
      v_outcome_up := v_final_a > v_final_b; -- UP = Creator A wins the head-to-head
      v_winning_side := case when v_outcome_up then 'up' else 'down' end;

      select coalesce(sum(notional_cents), 0) into v_winning_notional
        from public.clout_pool_positions
        where pool_id = p_pool_id and side = v_winning_side and status = 'open';

      if v_winning_notional = 0 then
        v_void := true;
        v_void_reason := 'no_surviving_positions_on_winning_side';
      end if;
    end if;
  else
    v_final_a := coalesce(p_final_metric_a, v_pool.current_metric);

    if v_pool.up_pool_cents = 0 or v_pool.down_pool_cents = 0 then
      v_void := true;
      v_void_reason := 'one_sided_pool_zero_volume';
    elsif v_final_a = v_pool.baseline_metric then
      v_void := true;
      v_void_reason := 'final_metric_tied_baseline';
    else
      v_outcome_up := v_final_a > v_pool.baseline_metric;
      v_winning_side := case when v_outcome_up then 'up' else 'down' end;

      select coalesce(sum(notional_cents), 0) into v_winning_notional
        from public.clout_pool_positions
        where pool_id = p_pool_id and side = v_winning_side and status = 'open';

      if v_winning_notional = 0 then
        v_void := true;
        v_void_reason := 'no_surviving_positions_on_winning_side';
      end if;
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
    set status = 'void', final_metric = v_final_a, final_metric_a = v_final_a, final_metric_b = v_final_b,
        void_reason = v_void_reason, resolved_at = now()
    where id = p_pool_id
    returning * into v_pool;

    return v_pool;
  end if;

  if v_pool.pool_type = 'war' then
    -- Dual revenue share: 5% platform, 2.5% Creator A, 2.5% Creator B — both
    -- rivals have skin in getting their fans to pile into the pool.
    v_creator_a_cents := round(v_total_pot * v_pool.creator_a_share_bps / 10000.0);
    v_creator_b_cents := round(v_total_pot * v_pool.creator_b_share_bps / 10000.0);
    v_platform_cents := round(v_total_pot * v_pool.platform_share_bps / 10000.0);
    v_prize_pool := v_total_pot - v_creator_a_cents - v_creator_b_cents - v_platform_cents;
  else
    v_creator_a_cents := round(v_total_pot * v_pool.creator_a_share_bps / 10000.0);
    v_platform_cents := round(v_total_pot * v_pool.platform_share_bps / 10000.0);
    v_prize_pool := v_total_pot - v_creator_a_cents - v_platform_cents;
  end if;

  for v_pos in
    select * from public.clout_pool_positions
    where pool_id = p_pool_id and side = v_winning_side and status = 'open'
    for update
  loop
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

  if v_creator_a_cents > 0 then
    insert into public.creator_earnings (creator_id, pool_id, amount_cents, source)
    values (v_pool.creator_a_id, p_pool_id, v_creator_a_cents,
            case when v_pool.pool_type = 'war' then 'war_pool_rake_share' else 'pool_rake_share' end);
  end if;
  if v_pool.pool_type = 'war' and v_creator_b_cents > 0 then
    insert into public.creator_earnings (creator_id, pool_id, amount_cents, source)
    values (v_pool.creator_b_id, p_pool_id, v_creator_b_cents, 'war_pool_rake_share');
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
      final_metric = v_final_a, final_metric_a = v_final_a, final_metric_b = v_final_b, resolved_at = now()
  where id = p_pool_id
  returning * into v_pool;

  return v_pool;
end;
$$;
