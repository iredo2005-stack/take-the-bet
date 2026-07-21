-- ─────────────────────────────────────────────────────────────────────────────
-- Baseline & Metric Ingestion Engine.
--
-- Phase 1 has no real oracle poller wired up yet (settle-pools' TODO comment
-- says as much) — until one exists, an admin needs a safe, atomic way to
-- seed/override the numbers that drive settlement and liquidation, so the
-- beta can be demoed and tested end-to-end:
--
--   1. A creator's rolling baseline (rolling_avg_metric) and live number
--      (realtime_metric) — these feed index_price and are the natural
--      baseline for any *new* single-creator pool created against this
--      creator.
--   2. An *existing open pool*'s live metric(s) directly — current_metric
--      for single pools, current_metric_a/current_metric_b for War Pools —
--      so an admin can walk a pool right up to its liquidation or settlement
--      line on demand.
--
-- Both operations are optional and independent (you can set one, the other,
-- or both in the same call); at least one of p_creator_id / p_pool_id must
-- be given. Row-locked exactly like every other CLOUT mutation in this
-- schema — never a bare UPDATE without a preceding `for update` select where
-- a decision needs to be made off the current row first.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.clout_admin_set_metrics(
  p_creator_id uuid default null,
  p_rolling_avg_metric numeric default null,
  p_realtime_metric numeric default null,
  p_pool_id uuid default null,
  p_current_metric numeric default null,
  p_current_metric_a numeric default null,
  p_current_metric_b numeric default null
) returns jsonb
language plpgsql
as $$
declare
  v_creator public.creators;
  v_pool public.clout_pools;
begin
  if p_creator_id is null and p_pool_id is null then
    raise exception 'must provide creatorId and/or poolId';
  end if;

  if p_creator_id is not null then
    update public.creators
    set rolling_avg_metric = coalesce(p_rolling_avg_metric, rolling_avg_metric),
        realtime_metric = coalesce(p_realtime_metric, realtime_metric),
        updated_at = now()
    where id = p_creator_id
    returning * into v_creator;

    if v_creator is null then
      raise exception 'creator % not found', p_creator_id;
    end if;
  end if;

  if p_pool_id is not null then
    select * into v_pool from public.clout_pools where id = p_pool_id for update;
    if v_pool is null then
      raise exception 'pool % not found', p_pool_id;
    end if;
    if v_pool.status <> 'open' then
      raise exception 'pool % is not open (status=%)', p_pool_id, v_pool.status;
    end if;

    if v_pool.pool_type = 'single' then
      if p_current_metric_a is not null or p_current_metric_b is not null then
        raise exception 'pool % is a single-creator pool — use currentMetric, not currentMetricA/currentMetricB', p_pool_id;
      end if;
      update public.clout_pools
      set current_metric = coalesce(p_current_metric, current_metric)
      where id = p_pool_id
      returning * into v_pool;
    else
      if p_current_metric is not null then
        raise exception 'pool % is a War Pool — use currentMetricA/currentMetricB, not currentMetric', p_pool_id;
      end if;
      update public.clout_pools
      set current_metric_a = coalesce(p_current_metric_a, current_metric_a),
          current_metric_b = coalesce(p_current_metric_b, current_metric_b)
      where id = p_pool_id
      returning * into v_pool;
    end if;
  end if;

  return jsonb_build_object('creator', to_jsonb(v_creator), 'pool', to_jsonb(v_pool));
end;
$$;
