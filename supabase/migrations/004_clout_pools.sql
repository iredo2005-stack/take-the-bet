-- ─────────────────────────────────────────────────────────────────────────────
-- CLOUT — Wallets, Pari-Mutuel Pools, Leveraged Positions, Creator Revenue Share
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- (Depends on 001/002/003 already having run — reuses public.users, public.creators,
-- adjust_user_balance_cents-style row-locking, and try_claim_order_slot for rate limiting.)
--
-- SCOPE: Phase 1 private beta only. Every balance here is simulated play-money —
-- there is no real-money redemption path, no fiat/crypto payment rail, and no
-- withdrawal endpoint in this schema. play_balance_cents and promo_bonus_balance_cents
-- are kept as separate buckets specifically so the "bonus credits are wagerable but
-- never cashable" rule is structural, not just a UI convention — that distinction is
-- the whole point of the promo-balance design even in a closed sandbox.
--
-- CLOUT's pool mechanics are deliberately kept in their own `clout_*` tables rather
-- than reusing Hype's leveraged_positions/prediction_pools: Hype's leverage engine is
-- a continuous perpetual-index long/short with funding rates; CLOUT's is a discrete
-- pari-mutuel UP/DOWN pool where "leverage" only ever changes a position's pro-rata
-- claim on a fixed pot (see the note above clout_calculate_live_payout for why that's
-- solvent), and liquidation forfeits the margin early rather than marking-to-market
-- against a live price. Different enough mechanics that sharing tables would just
-- create special-cased columns nobody could reason about safely.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Dual-bucket wallet ────────────────────────────────────────────────────────
create table if not exists public.wallets (
  user_id                   uuid primary key references public.users(id) on delete cascade,
  play_balance_cents        bigint not null default 0 check (play_balance_cents >= 0),
  promo_bonus_balance_cents bigint not null default 0 check (promo_bonus_balance_cents >= 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create or replace function public.clout_touch_wallet_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wallets_updated_at on public.wallets;
create trigger wallets_updated_at before update on public.wallets
  for each row execute function public.clout_touch_wallet_updated_at();

-- ── Pools: discrete UP/DOWN pari-mutuel pools against a rolling 4-week baseline ─
create table if not exists public.clout_pools (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          uuid references public.creators(id) not null,
  platform            text not null check (platform in ('youtube','twitter','twitch','spotify')),
  metric_type         text not null check (metric_type in ('views','likes','concurrent_viewers','streams')),
  content_external_id text,
  content_title       text,
  window_label        text not null,                 -- '48h' | '12h' | 'live-stream' — display only
  baseline_metric     numeric not null,               -- rolling 4-week baseline captured at pool creation
  current_metric      numeric not null default 0,     -- live tracked value (updated by a poller/cron)
  status              text not null default 'open' check (
                        status in ('open','resolved_up','resolved_down','void')
                      ),
  up_pool_cents       bigint not null default 0,      -- total CASH (margins) ever contributed to UP —
                                                       -- includes liquidated positions' forfeited margin,
                                                       -- since that cash never leaves the pool
  down_pool_cents     bigint not null default 0,      -- same, for DOWN
  rake_bps            integer not null default 1000,  -- 10% guaranteed rake
  creator_share_bps   integer not null default 500,   -- 5% of total pool -> creator
  platform_share_bps  integer not null default 500,   -- 5% of total pool -> platform
  final_metric        numeric,
  void_reason         text,
  opens_at            timestamptz not null default now(),
  expires_at          timestamptz not null,
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists idx_clout_pools_open on public.clout_pools(status, expires_at) where status = 'open';

-- ── Positions: leveraged entries on one side of a pool ────────────────────────
create table if not exists public.clout_pool_positions (
  id                        uuid primary key default gen_random_uuid(),
  pool_id                   uuid references public.clout_pools(id) on delete cascade not null,
  user_id                   uuid references public.users(id) not null,
  side                      text not null check (side in ('up','down')),
  leverage                  integer not null default 1 check (leverage in (1, 5, 10)),
  margin_cents              bigint not null check (margin_cents > 0),   -- actual cash at risk (max loss)
  notional_cents            bigint not null,                            -- margin_cents * leverage — pro-rata weight only
  funded_from_bonus_cents   bigint not null default 0,                  -- how much of margin+premium came from promo balance
  insurance_purchased       boolean not null default false,
  insurance_premium_cents   bigint not null default 0,                  -- 5% of margin, charged separately from margin
  liquidation_trigger_ratio numeric not null default 0.20,               -- 20% adverse move vs. baseline
  status                    text not null default 'open' check (
                              status in ('open','liquidated','won','lost','void')
                            ),
  live_payout_cents         bigint,          -- cached "if the pool resolved my way right now" estimate
  payout_cents              bigint,          -- final realized payout (set by the settlement engine)
  client_request_id         text,
  liquidated_at             timestamptz,
  settled_at                timestamptz,
  created_at                timestamptz not null default now()
);
create index if not exists idx_clout_positions_pool on public.clout_pool_positions(pool_id, side, status);
create index if not exists idx_clout_positions_user on public.clout_pool_positions(user_id);
create unique index if not exists idx_clout_positions_idempotency
  on public.clout_pool_positions(user_id, client_request_id) where client_request_id is not null;

-- ── Creator revenue share ledger (5% of every pool's total volume) ────────────
create table if not exists public.creator_earnings (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid references public.creators(id) not null,
  pool_id     uuid references public.clout_pools(id),
  amount_cents bigint not null check (amount_cents >= 0),
  source      text not null default 'pool_rake_share',
  created_at  timestamptz not null default now()
);
create index if not exists idx_creator_earnings_creator on public.creator_earnings(creator_id, created_at desc);

-- ── Platform's own share of the rake + misc ledger (rounding dust, insurance premiums) ─
create table if not exists public.clout_platform_ledger (
  id              uuid primary key default gen_random_uuid(),
  amount_cents    bigint not null,
  source          text not null check (source in (
                    'pool_platform_share','pool_rounding_dust','insurance_premium'
                  )),
  reference_table text,
  reference_id    uuid,
  created_at      timestamptz default now()
);

alter table public.wallets                enable row level security;
alter table public.clout_pools            enable row level security;
alter table public.clout_pool_positions   enable row level security;
alter table public.creator_earnings       enable row level security;
alter table public.clout_platform_ledger  enable row level security;

create policy "public_read_wallets"              on public.wallets              for select using (true);
create policy "public_read_clout_pools"          on public.clout_pools          for select using (true);
create policy "public_read_clout_pool_positions" on public.clout_pool_positions for select using (true);
create policy "public_read_creator_earnings"     on public.creator_earnings     for select using (true);
-- clout_platform_ledger: service-role only, no public policy (internal accounting)

-- ─────────────────────────────────────────────────────────────────────────────
-- Wallet helpers
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clout_get_or_create_wallet(p_user_id uuid)
returns public.wallets
language plpgsql
as $$
declare
  v_wallet public.wallets;
begin
  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if v_wallet is null then
    insert into public.wallets (user_id) values (p_user_id)
    on conflict (user_id) do nothing
    returning * into v_wallet;
    if v_wallet is null then
      select * into v_wallet from public.wallets where user_id = p_user_id for update;
    end if;
  end if;
  return v_wallet;
end;
$$;

-- Adjusts play and/or promo balances atomically in one row-locked statement.
-- Positive deltas credit, negative deltas debit. Rejects if either bucket would
-- go negative unless p_allow_negative is true (used for system-side corrections
-- only — never for user-initiated debits).
create or replace function public.clout_adjust_wallet(
  p_user_id uuid,
  p_play_delta_cents bigint,
  p_promo_delta_cents bigint,
  p_allow_negative boolean default false
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

  return v_wallet;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Opening a position: draws margin + insurance premium play-balance-first, then
-- promo-balance, records the split for audit, and adds the margin to the pool's
-- cash total. No artificial execution delay here (unlike Hype's leverage engine) —
-- entering a side of a pari-mutuel pool doesn't have a "price" to front-run the
-- way a continuous index feed does; the payout ratio is just each side's live
-- pool share, visible to everyone the same way at the same time.
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- Draw play balance first, then promo/bonus balance for the remainder.
  v_from_play := least(v_wallet.play_balance_cents, v_total_charge_cents);
  v_from_promo := v_total_charge_cents - v_from_play;

  if v_from_promo > v_wallet.promo_bonus_balance_cents then
    raise exception 'insufficient_balance';
  end if;

  perform public.clout_adjust_wallet(p_user_id, -v_from_play, -v_from_promo, false);

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
-- Dynamic Payout Calculator
--
-- Why leverage can't cause a shortfall even with "no house risk": a winning
-- position is paid exactly `prize_pool_cash * (my_notional / winning_side_total_notional)`.
-- That is a proportional split of a FIXED, already-collected pot — the sum of
-- every winner's payout is mathematically always exactly prize_pool_cash
-- (mod integer-rounding dust), no matter how "weight" (notional) is defined.
-- Leverage only changes how big a slice of that fixed pot a position claims
-- relative to other winners; it never lets anyone claim money that wasn't
-- actually collected. That's what makes leverage-as-pro-rata-weight solvent
-- in a pari-mutuel pool, unlike leverage-as-borrowed-capital.
--
-- Liquidated positions are excluded from "winning_side_total_notional" (their
-- margin already stayed in the pool but they're not entitled to a share), so a
-- liquidation simply behaves like an early, forced loss.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.clout_calculate_live_payout(p_position_id uuid)
returns bigint
language plpgsql
stable
as $$
declare
  v_pos public.clout_pool_positions;
  v_pool public.clout_pools;
  v_total_cash bigint;
  v_prize_pool bigint;
  v_side_notional bigint;
begin
  select * into v_pos from public.clout_pool_positions where id = p_position_id;
  if v_pos is null or v_pos.status <> 'open' then return 0; end if;

  select * into v_pool from public.clout_pools where id = v_pos.pool_id;
  if v_pool is null then return 0; end if;

  v_total_cash := v_pool.up_pool_cents + v_pool.down_pool_cents;
  v_prize_pool := floor(v_total_cash * (10000 - v_pool.rake_bps) / 10000.0);

  select coalesce(sum(notional_cents), 0) into v_side_notional
    from public.clout_pool_positions
    where pool_id = v_pool.id and side = v_pos.side and status = 'open';

  if v_side_notional = 0 then return 0; end if;

  -- Multiply the two exact integers first, divide once at the end — dividing
  -- notional/side_notional first would truncate any repeating decimal (e.g.
  -- 100000/105000 = 20/21) before the multiplication, compounding into an
  -- off-by-one-cent shortfall. Caught this exact bug via the local Postgres
  -- smoke test: summed winner payouts came out to 31499 instead of the
  -- mathematically exact 31500.
  return floor((v_prize_pool * v_pos.notional_cents::numeric) / v_side_notional);
end;
$$;

-- Bulk refresh — call after every new wager (or on a timer) so every open
-- position's cached live_payout_cents reflects the current pool volume.
create or replace function public.clout_refresh_pool_payouts(p_pool_id uuid)
returns integer
language plpgsql
as $$
declare
  v_updated integer := 0;
  v_pos record;
begin
  for v_pos in
    select id from public.clout_pool_positions where pool_id = p_pool_id and status = 'open'
  loop
    update public.clout_pool_positions
    set live_payout_cents = public.clout_calculate_live_payout(v_pos.id)
    where id = v_pos.id;
    v_updated := v_updated + 1;
  end loop;
  return v_updated;
end;
$$;
