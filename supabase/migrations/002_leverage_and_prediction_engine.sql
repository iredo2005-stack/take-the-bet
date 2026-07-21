-- ─────────────────────────────────────────────────────────────────────────────
-- Take The Bet — Leverage Engine, 48h Prediction Pools, Admin Ledger
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- SCOPE NOTE: This entire subsystem settles in simulated "Hype Coins" test
-- balances (the same virtual balance the rest of the app already uses).
-- There is no real USDC / on-chain wallet integration here — see README
-- for why. All money in the tables below is stored as whole integer CENTS
-- (never floats/decimals) specifically to avoid rounding drift in the
-- leverage/funding math, which compounds much faster than the existing
-- simple buy/sell flows.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Creator index metrics (rolling average + live weighted metric) ───────────
alter table public.creators
  add column if not exists base_index_price      numeric(14,4) not null default 1.0000,
  add column if not exists index_price           numeric(14,4) not null default 1.0000,
  add column if not exists rolling_avg_metric    numeric not null default 0,
  add column if not exists realtime_metric       numeric not null default 0,
  add column if not exists live_metric_weight    numeric(3,2) not null default 0.50 check (live_metric_weight between 0 and 1),
  add column if not exists is_live               boolean not null default false,
  add column if not exists last_seen_content_id  text;

comment on column public.creators.rolling_avg_metric is 'EMA over ~4 weeks of the weighted (video + live) metric — the denominator of the index ratio.';
comment on column public.creators.index_price is 'Perpetual "stock" index price = base * clamp(realtime_metric / rolling_avg_metric).';

-- ── Rate limiting / idempotency support on users ──────────────────────────────
alter table public.users
  add column if not exists last_order_at timestamptz,
  add column if not exists tier          text not null default 'bronze' check (tier in ('bronze','silver','gold','alpha')),
  add column if not exists roi_30d       numeric;

-- ── Admin wallet ledger (simulated platform revenue — spreads, pool fees, dust) ─
create table if not exists public.admin_wallet_ledger (
  id              uuid primary key default gen_random_uuid(),
  amount_cents    bigint not null check (amount_cents >= 0),
  source          text not null check (source in (
                    'leverage_open_spread','leverage_close_spread',
                    'pool_fee','funding_rounding_dust','pool_rounding_dust'
                  )),
  reference_table text,
  reference_id    uuid,
  created_at      timestamptz default now()
);
create index if not exists idx_admin_ledger_source on public.admin_wallet_ledger(source, created_at desc);

-- ── Leveraged positions ("Stocks Mode" — Long/Short on a creator's index) ────
create table if not exists public.leveraged_positions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid references public.users(id) not null,
  creator_id                uuid references public.creators(id) not null,
  side                      text not null check (side in ('long','short')),
  leverage                  integer not null check (leverage in (3,5)),
  collateral_cents          bigint not null check (collateral_cents > 0),
  notional_cents            bigint not null check (notional_cents > 0),
  maintenance_margin_cents  bigint not null,
  entry_index_price         numeric(14,4),
  exit_index_price          numeric(14,4),
  open_fee_cents            bigint not null default 0,
  close_fee_cents           bigint not null default 0,
  funding_paid_cents        bigint not null default 0,
  pnl_cents                 bigint,
  status                    text not null default 'pending' check (
                              status in ('pending','open','pending_close','closed','liquidated','void')
                            ),
  client_request_id         text,
  requested_at              timestamptz not null default now(),
  execute_at                timestamptz not null,
  opened_at                 timestamptz,
  closed_at                 timestamptz,
  created_at                timestamptz not null default now()
);
create index if not exists idx_lev_pos_user       on public.leveraged_positions(user_id);
create index if not exists idx_lev_pos_creator     on public.leveraged_positions(creator_id, status);
create index if not exists idx_lev_pos_open        on public.leveraged_positions(status) where status in ('open','pending','pending_close');
create unique index if not exists idx_lev_pos_idempotency
  on public.leveraged_positions(user_id, client_request_id) where client_request_id is not null;

-- ── Funding events (P2P — the house takes zero cut) ───────────────────────────
create table if not exists public.funding_events (
  id                    uuid primary key default gen_random_uuid(),
  creator_id            uuid references public.creators(id) not null,
  period_start          timestamptz not null,
  period_end            timestamptz not null,
  long_notional_cents   bigint not null,
  short_notional_cents  bigint not null,
  funding_rate_bps      integer not null,
  paying_side           text check (paying_side in ('long','short',null)),
  total_funding_cents   bigint not null default 0,
  positions_affected    integer not null default 0,
  created_at            timestamptz default now()
);
create index if not exists idx_funding_events_creator on public.funding_events(creator_id, period_end desc);

-- ── 48h binary prediction pools ("Pool-Based Mode") ───────────────────────────
create table if not exists public.prediction_pools (
  id                      uuid primary key default gen_random_uuid(),
  creator_id              uuid references public.creators(id) not null,
  platform                text not null check (platform in ('youtube','twitch','twitter','instagram')),
  content_external_id     text not null,
  content_title           text,
  content_url             text,
  metric_type             text not null default 'views' check (metric_type in ('views','concurrent_viewers')),
  rolling_avg_at_creation numeric not null,
  threshold_metric        numeric not null,
  question                text,
  status                  text not null default 'open' check (
                            status in ('open','resolved_yes','resolved_no','void')
                          ),
  yes_pool_cents          bigint not null default 0,
  no_pool_cents           bigint not null default 0,
  fee_cents               bigint not null default 0,
  final_metric            numeric,
  void_reason             text,
  opens_at                timestamptz not null default now(),
  expires_at              timestamptz not null,
  resolved_at             timestamptz,
  created_at              timestamptz not null default now()
);
create index if not exists idx_pools_open on public.prediction_pools(status, expires_at) where status = 'open';
-- one live pool per piece of content at a time
create unique index if not exists idx_pools_active_content
  on public.prediction_pools(platform, content_external_id) where status = 'open';

create table if not exists public.prediction_tickets (
  id                  uuid primary key default gen_random_uuid(),
  pool_id             uuid references public.prediction_pools(id) on delete cascade not null,
  user_id             uuid references public.users(id) not null,
  side                text not null check (side in ('yes','no')),
  amount_cents        bigint not null check (amount_cents > 0),
  payout_cents        bigint,
  client_request_id   text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_tickets_pool on public.prediction_tickets(pool_id);
create index if not exists idx_tickets_user on public.prediction_tickets(user_id);
create unique index if not exists idx_tickets_idempotency
  on public.prediction_tickets(user_id, client_request_id) where client_request_id is not null;

-- ── Ingestion event log (webhook/poller audit trail) ──────────────────────────
create table if not exists public.ingestion_events (
  id           uuid primary key default gen_random_uuid(),
  platform     text not null,
  creator_id   uuid references public.creators(id),
  external_id  text,
  event_type   text not null,
  status       text not null default 'received',
  payload      jsonb,
  error        text,
  created_at   timestamptz default now()
);
create index if not exists idx_ingestion_events_recent on public.ingestion_events(created_at desc);

-- ── Live ticks (consumed by the frontend via Supabase Realtime) ──────────────
create table if not exists public.live_ticks (
  id               bigserial primary key,
  creator_id       uuid references public.creators(id) not null,
  index_price      numeric(14,4) not null,
  realtime_metric  numeric,
  is_live          boolean not null default false,
  ts               timestamptz not null default now()
);
create index if not exists idx_live_ticks_creator_ts on public.live_ticks(creator_id, ts desc);

do $$
begin
  execute 'alter publication supabase_realtime add table public.live_ticks';
exception when others then
  -- publication may not exist under this name yet, or table already added —
  -- enable Realtime for this table from the Supabase dashboard instead.
  raise notice 'Could not auto-attach live_ticks to supabase_realtime: %', sqlerrm;
end $$;

alter table public.admin_wallet_ledger  enable row level security;
alter table public.leveraged_positions  enable row level security;
alter table public.funding_events       enable row level security;
alter table public.prediction_pools     enable row level security;
alter table public.prediction_tickets   enable row level security;
alter table public.ingestion_events     enable row level security;
alter table public.live_ticks           enable row level security;

create policy "public_read_prediction_pools"   on public.prediction_pools   for select using (true);
create policy "public_read_prediction_tickets" on public.prediction_tickets for select using (true);
create policy "public_read_leveraged_positions" on public.leveraged_positions for select using (true);
create policy "public_read_live_ticks"         on public.live_ticks         for select using (true);
-- admin_wallet_ledger, funding_events, ingestion_events: service-role only (no public policy)

-- ─────────────────────────────────────────────────────────────────────────────
-- Money helpers — all balance mutation MUST go through this function so every
-- change is serialized by Postgres row locking (`for update`). This is what
-- stops "click Open Position twice fast" from ever double-spending: the
-- second concurrent call blocks on the row lock until the first commits,
-- then re-reads the already-updated balance.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.adjust_user_balance_cents(
  p_user_id uuid,
  p_delta_cents bigint,
  p_allow_negative boolean default false
) returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
  v_new     numeric;
begin
  select balance into v_balance from public.users where id = p_user_id for update;
  if v_balance is null then
    raise exception 'user_not_found';
  end if;

  v_new := round(v_balance + (p_delta_cents::numeric / 100), 2);
  if not p_allow_negative and v_new < 0 then
    raise exception 'insufficient_balance';
  end if;

  update public.users set balance = v_new where id = p_user_id;
  return v_new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rate limit: max 1 order per 5s per user. Single atomic UPDATE ... WHERE —
-- if zero rows update, the caller was too fast and gets rejected instantly.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.try_claim_order_slot(p_user_id uuid, p_min_gap_seconds numeric default 5)
returns boolean
language plpgsql
as $$
declare
  v_updated boolean;
begin
  update public.users
  set last_order_at = now()
  where id = p_user_id
    and (last_order_at is null or last_order_at <= now() - make_interval(secs => p_min_gap_seconds))
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Leveraged positions: open (reserve funds immediately) → execute (settle at
-- the FUTURE price, after the 3-5s randomized delay has elapsed server-side).
-- Funds are debited at request time, not at execution time, specifically so a
-- duplicate/rapid click fails on insufficient balance rather than opening two
-- positions against the same money.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.request_open_leveraged_position(
  p_user_id uuid,
  p_creator_id uuid,
  p_side text,
  p_leverage integer,
  p_collateral_cents bigint,
  p_spread_bps integer,
  p_maintenance_ratio_bps integer,
  p_execute_at timestamptz,
  p_client_request_id text
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

  v_notional_cents := p_collateral_cents * p_leverage;
  v_open_fee_cents := round(v_notional_cents * p_spread_bps / 10000.0);
  v_maintenance_cents := round(p_collateral_cents * p_maintenance_ratio_bps / 10000.0);

  -- Reserve collateral + spread fee now (this call is itself the double-spend guard).
  perform public.adjust_user_balance_cents(p_user_id, -(p_collateral_cents + v_open_fee_cents), false);

  insert into public.leveraged_positions (
    user_id, creator_id, side, leverage, collateral_cents, notional_cents,
    maintenance_margin_cents, open_fee_cents, status, execute_at, client_request_id
  ) values (
    p_user_id, p_creator_id, p_side, p_leverage, p_collateral_cents, v_notional_cents,
    v_maintenance_cents, v_open_fee_cents, 'pending', p_execute_at, p_client_request_id
  ) returning * into v_row;

  insert into public.admin_wallet_ledger (amount_cents, source, reference_table, reference_id)
  values (v_open_fee_cents, 'leverage_open_spread', 'leveraged_positions', v_row.id);

  return v_row;
end;
$$;

create or replace function public.finalize_open_leveraged_position(p_position_id uuid)
returns public.leveraged_positions
language plpgsql
as $$
declare
  v_pos public.leveraged_positions;
  v_price numeric;
begin
  select * into v_pos from public.leveraged_positions where id = p_position_id for update;
  if v_pos is null then raise exception 'position_not_found'; end if;
  if v_pos.status <> 'pending' then return v_pos; end if; -- already finalized (idempotent)

  select index_price into v_price from public.creators where id = v_pos.creator_id;

  update public.leveraged_positions
  set status = 'open', entry_index_price = v_price, opened_at = now()
  where id = p_position_id
  returning * into v_pos;

  return v_pos;
end;
$$;

create or replace function public.request_close_leveraged_position(
  p_position_id uuid, p_user_id uuid, p_execute_at timestamptz
) returns public.leveraged_positions
language plpgsql
as $$
declare
  v_pos public.leveraged_positions;
begin
  select * into v_pos from public.leveraged_positions
    where id = p_position_id and user_id = p_user_id for update;
  if v_pos is null then raise exception 'position_not_found'; end if;
  if v_pos.status <> 'open' then raise exception 'position_not_open'; end if;

  update public.leveraged_positions
  set status = 'pending_close', execute_at = p_execute_at
  where id = p_position_id
  returning * into v_pos;

  return v_pos;
end;
$$;

-- Shared by user-initiated close, auto-liquidation, and the stale-pending sweep.
create or replace function public.finalize_close_leveraged_position(
  p_position_id uuid, p_spread_bps integer, p_force_liquidate boolean default false
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
  select * into v_pos from public.leveraged_positions where id = p_position_id for update;
  if v_pos is null then raise exception 'position_not_found'; end if;
  if v_pos.status not in ('pending_close','open') then return v_pos; end if; -- idempotent / already closed
  if v_pos.status = 'open' and not p_force_liquidate then raise exception 'not_pending_close'; end if;

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

  v_new_status := case when p_force_liquidate then 'liquidated' else 'closed' end;

  update public.leveraged_positions
  set status = v_new_status, exit_index_price = v_price, pnl_cents = v_pnl_cents - v_close_fee_cents,
      close_fee_cents = v_close_fee_cents, closed_at = now()
  where id = p_position_id
  returning * into v_pos;

  return v_pos;
end;
$$;

-- Maintenance-margin check for the liquidation cron worker.
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
    perform public.finalize_close_leveraged_position(p_position_id, p_spread_bps, true);
    return true;
  end if;

  return false;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Funding: pure P2P transfer between longs and shorts on one creator. Net
-- amount paid always equals net amount received (rounding dust goes to the
-- ledger as a transparent line item, never silently dropped or kept as profit
-- beyond that dust).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.apply_funding_period(
  p_creator_id uuid, p_period_start timestamptz, p_period_end timestamptz, p_max_rate_bps integer default 50
) returns public.funding_events
language plpgsql
as $$
declare
  v_long_notional bigint := 0;
  v_short_notional bigint := 0;
  v_rate_bps integer;
  v_paying_side text;
  v_receiving_notional bigint;
  v_total_funding bigint := 0;
  v_affected integer := 0;
  v_dust bigint;
  v_pos record;
  v_event public.funding_events;
begin
  select coalesce(sum(notional_cents) filter (where side = 'long'), 0),
         coalesce(sum(notional_cents) filter (where side = 'short'), 0)
    into v_long_notional, v_short_notional
    from public.leveraged_positions
    where creator_id = p_creator_id and status = 'open';

  if v_long_notional = 0 or v_short_notional = 0 then
    -- one-sided or empty book — nothing to settle, still record a zero event for audit
    insert into public.funding_events (
      creator_id, period_start, period_end, long_notional_cents, short_notional_cents,
      funding_rate_bps, paying_side, total_funding_cents, positions_affected
    ) values (
      p_creator_id, p_period_start, p_period_end, v_long_notional, v_short_notional, 0, null, 0, 0
    ) returning * into v_event;
    return v_event;
  end if;

  if v_long_notional > v_short_notional then
    v_paying_side := 'long';
    v_receiving_notional := v_short_notional;
    v_rate_bps := least(p_max_rate_bps, round(((v_long_notional - v_short_notional)::numeric / greatest(v_long_notional, v_short_notional)) * 10000));
  elsif v_short_notional > v_long_notional then
    v_paying_side := 'short';
    v_receiving_notional := v_long_notional;
    v_rate_bps := least(p_max_rate_bps, round(((v_short_notional - v_long_notional)::numeric / greatest(v_long_notional, v_short_notional)) * 10000));
  else
    v_paying_side := null;
    v_rate_bps := 0;
  end if;

  if v_paying_side is not null and v_rate_bps > 0 then
    -- Payers: each pays rate_bps of its own notional.
    for v_pos in
      select id, user_id, notional_cents from public.leveraged_positions
      where creator_id = p_creator_id and status = 'open' and side = v_paying_side
      for update
    loop
      declare
        v_amt bigint := round(v_pos.notional_cents * v_rate_bps / 10000.0);
        v_balance numeric;
      begin
        -- Never drive a wallet negative from funding: cap what's collected at
        -- whatever free balance the payer actually has (spec 6D — zero floor).
        select balance into v_balance from public.users where id = v_pos.user_id for update;
        v_amt := least(v_amt, greatest(0, floor(v_balance * 100)::bigint));

        if v_amt > 0 then
          perform public.adjust_user_balance_cents(v_pos.user_id, -v_amt, false);
          update public.leveraged_positions set funding_paid_cents = funding_paid_cents + v_amt where id = v_pos.id;
          v_total_funding := v_total_funding + v_amt;
        end if;
        v_affected := v_affected + 1;
      end;
    end loop;

    -- Receivers: split the collected pool pro-rata by their notional share.
    declare v_distributed bigint := 0;
    begin
      for v_pos in
        select id, user_id, notional_cents from public.leveraged_positions
        where creator_id = p_creator_id and status = 'open' and side <> v_paying_side
        for update
      loop
        declare v_amt bigint := floor(v_total_funding * (v_pos.notional_cents::numeric / v_receiving_notional));
        begin
          perform public.adjust_user_balance_cents(v_pos.user_id, v_amt, true);
          update public.leveraged_positions set funding_paid_cents = funding_paid_cents - v_amt where id = v_pos.id;
          v_distributed := v_distributed + v_amt;
          v_affected := v_affected + 1;
        end;
      end loop;

      v_dust := v_total_funding - v_distributed;
      if v_dust > 0 then
        insert into public.admin_wallet_ledger (amount_cents, source, reference_table, reference_id)
        values (v_dust, 'funding_rounding_dust', 'creators', p_creator_id);
      end if;
    end;
  end if;

  insert into public.funding_events (
    creator_id, period_start, period_end, long_notional_cents, short_notional_cents,
    funding_rate_bps, paying_side, total_funding_cents, positions_affected
  ) values (
    p_creator_id, p_period_start, p_period_end, v_long_notional, v_short_notional,
    v_rate_bps, v_paying_side, v_total_funding, v_affected
  ) returning * into v_event;

  return v_event;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Prediction pools: place a ticket (locks the pool row to serialize concurrent
-- bets), resolve at 48h (10% fee, 90% pro-rata to winners), or void on
-- content-deletion (100% refund, zero fees, per the Creator Rig Guard).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.place_prediction_ticket(
  p_pool_id uuid, p_user_id uuid, p_side text, p_amount_cents bigint, p_client_request_id text
) returns public.prediction_tickets
language plpgsql
as $$
declare
  v_pool public.prediction_pools;
  v_ticket public.prediction_tickets;
begin
  if p_side not in ('yes','no') then raise exception 'invalid_side'; end if;
  if p_amount_cents <= 0 then raise exception 'invalid_amount'; end if;

  select * into v_pool from public.prediction_pools where id = p_pool_id for update;
  if v_pool is null then raise exception 'pool_not_found'; end if;
  if v_pool.status <> 'open' then raise exception 'pool_closed'; end if;
  if now() >= v_pool.expires_at then raise exception 'pool_expired'; end if;

  perform public.adjust_user_balance_cents(p_user_id, -p_amount_cents, false);

  insert into public.prediction_tickets (pool_id, user_id, side, amount_cents, client_request_id)
  values (p_pool_id, p_user_id, p_side, p_amount_cents, p_client_request_id)
  returning * into v_ticket;

  if p_side = 'yes' then
    update public.prediction_pools set yes_pool_cents = yes_pool_cents + p_amount_cents where id = p_pool_id;
  else
    update public.prediction_pools set no_pool_cents = no_pool_cents + p_amount_cents where id = p_pool_id;
  end if;

  return v_ticket;
end;
$$;

create or replace function public.resolve_prediction_pool(
  p_pool_id uuid, p_outcome_yes boolean, p_final_metric numeric, p_fee_bps integer default 1000
) returns public.prediction_pools
language plpgsql
as $$
declare
  v_pool public.prediction_pools;
  v_total bigint;
  v_fee bigint;
  v_prize bigint;
  v_winners_pool bigint;
  v_winning_side text;
  v_distributed bigint := 0;
  v_dust bigint;
  v_t record;
begin
  select * into v_pool from public.prediction_pools where id = p_pool_id for update;
  if v_pool is null then raise exception 'pool_not_found'; end if;
  if v_pool.status <> 'open' then return v_pool; end if; -- idempotent

  v_winning_side := case when p_outcome_yes then 'yes' else 'no' end;
  v_total := v_pool.yes_pool_cents + v_pool.no_pool_cents;
  v_winners_pool := case when p_outcome_yes then v_pool.yes_pool_cents else v_pool.no_pool_cents end;
  v_fee := round(v_total * p_fee_bps / 10000.0);
  v_prize := v_total - v_fee;

  if v_winners_pool > 0 then
    for v_t in
      select id, user_id, amount_cents from public.prediction_tickets
      where pool_id = p_pool_id and side = v_winning_side
      for update
    loop
      declare v_payout bigint := floor(v_prize * (v_t.amount_cents::numeric / v_winners_pool));
      begin
        update public.prediction_tickets set payout_cents = v_payout where id = v_t.id;
        perform public.adjust_user_balance_cents(v_t.user_id, v_payout, true);
        v_distributed := v_distributed + v_payout;
      end;
    end loop;
  end if;

  update public.prediction_tickets set payout_cents = 0
  where pool_id = p_pool_id and side <> v_winning_side and payout_cents is null;

  if v_fee > 0 then
    insert into public.admin_wallet_ledger (amount_cents, source, reference_table, reference_id)
    values (v_fee, 'pool_fee', 'prediction_pools', p_pool_id);
  end if;

  v_dust := v_prize - v_distributed;
  if v_dust > 0 then
    insert into public.admin_wallet_ledger (amount_cents, source, reference_table, reference_id)
    values (v_dust, 'pool_rounding_dust', 'prediction_pools', p_pool_id);
  end if;

  update public.prediction_pools
  set status = case when p_outcome_yes then 'resolved_yes' else 'resolved_no' end,
      final_metric = p_final_metric, fee_cents = v_fee, resolved_at = now()
  where id = p_pool_id
  returning * into v_pool;

  return v_pool;
end;
$$;

-- Market Void Execution (6C): creator deletes/privates content mid-cycle —
-- bypass all fees, refund 100% of every ticket.
create or replace function public.void_prediction_pool(p_pool_id uuid, p_reason text)
returns public.prediction_pools
language plpgsql
as $$
declare
  v_pool public.prediction_pools;
  v_t record;
begin
  select * into v_pool from public.prediction_pools where id = p_pool_id for update;
  if v_pool is null then raise exception 'pool_not_found'; end if;
  if v_pool.status <> 'open' then return v_pool; end if; -- idempotent

  for v_t in select id, user_id, amount_cents from public.prediction_tickets where pool_id = p_pool_id for update
  loop
    perform public.adjust_user_balance_cents(v_t.user_id, v_t.amount_cents, true);
    update public.prediction_tickets set payout_cents = v_t.amount_cents where id = v_t.id;
  end loop;

  update public.prediction_pools
  set status = 'void', void_reason = p_reason, fee_cents = 0, resolved_at = now()
  where id = p_pool_id
  returning * into v_pool;

  return v_pool;
end;
$$;
