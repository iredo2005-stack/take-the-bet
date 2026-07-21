-- ─────────────────────────────────────────────────────────────────────────────
-- War Pool liquidation — Market Share / Ratio Model.
--
-- Migration 008 left War Pool positions immune to liquidation entirely
-- (clout_check_liquidations returned early for any pool_type <> 'single').
-- This migration replaces that early-return with the deterministic ratio
-- model the user specified:
--
--   1. total_metric = current_metric_a + current_metric_b
--   2. share_a = current_metric_a / total_metric   (share_b = 1 - share_a)
--   3. baseline_share_a = the ratio at pool-open time (defaults to 0.5 / 50-50
--      if the pool was created without an explicit override)
--   4. An UP position (backing Creator A) liquidates once share_a has fallen
--      trigger_ratio (20% by default, per-position via liquidation_trigger_ratio)
--      *relative to* baseline_share_a — i.e. share_a <= baseline_share_a * (1 - trigger_ratio).
--      A DOWN position (backing Creator B) liquidates on the mirror condition
--      against share_b / baseline_share_b.
--   5. Same insurance protocol as single pools: has_insurance refunds 50% of
--      margin into promo_bonus_balance_cents.
--
-- baseline_share_a is a new, separate column from baseline_metric on purpose:
-- baseline_metric is a raw metric value (single-pool semantics), whereas
-- baseline_share_a is always a 0..1 ratio (War Pool semantics) — conflating
-- them would make both harder to reason about.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clout_pools add column if not exists baseline_share_a numeric;

alter table public.clout_pools
  add constraint clout_pools_baseline_share_a_check
  check (baseline_share_a is null or (baseline_share_a > 0 and baseline_share_a < 1));

create or replace function public.clout_check_liquidations(p_pool_id uuid)
returns table(position_id uuid, liq_user_id uuid, side text, insurance_refund_cents bigint)
language plpgsql
as $$
declare
  v_pool public.clout_pools;
  v_pos record;
  v_should_liquidate boolean;
  v_refund bigint;
  v_total_metric numeric;
  v_share_a numeric;
  v_share_b numeric;
  v_baseline_share_a numeric;
  v_baseline_share_b numeric;
begin
  select * into v_pool from public.clout_pools where id = p_pool_id for update;
  if v_pool is null or v_pool.status <> 'open' then
    return;
  end if;

  -- Precompute War Pool share state once per call; single pools never touch these.
  if v_pool.pool_type <> 'single' then
    v_total_metric := coalesce(v_pool.current_metric_a, 0) + coalesce(v_pool.current_metric_b, 0);
    if v_total_metric <= 0 then
      return; -- no usable signal yet (e.g. both metrics still zero) — skip safely, nobody liquidates.
    end if;
    v_share_a := v_pool.current_metric_a / v_total_metric;
    v_share_b := 1 - v_share_a;
    v_baseline_share_a := coalesce(v_pool.baseline_share_a, 0.5);
    v_baseline_share_b := 1 - v_baseline_share_a;
  end if;

  for v_pos in
    select * from public.clout_pool_positions
    where pool_id = p_pool_id and status = 'open' and leverage > 1
    for update
  loop
    v_should_liquidate := false;

    if v_pool.pool_type = 'single' then
      if v_pos.side = 'up' then
        if v_pool.current_metric <= v_pool.baseline_metric * (1 - v_pos.liquidation_trigger_ratio) then
          v_should_liquidate := true;
        end if;
      else
        if v_pool.current_metric >= v_pool.baseline_metric * (1 + v_pos.liquidation_trigger_ratio) then
          v_should_liquidate := true;
        end if;
      end if;
    else
      -- War Pool: adverse move is a drop in *market share*, not the raw metric.
      -- UP backs Creator A's share; DOWN backs Creator B's share. Both use the
      -- same relative-drop trigger_ratio, applied against each side's own baseline share.
      if v_pos.side = 'up' then
        if v_share_a <= v_baseline_share_a * (1 - v_pos.liquidation_trigger_ratio) then
          v_should_liquidate := true;
        end if;
      else
        if v_share_b <= v_baseline_share_b * (1 - v_pos.liquidation_trigger_ratio) then
          v_should_liquidate := true;
        end if;
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
