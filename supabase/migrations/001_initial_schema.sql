-- ─────────────────────────────────────────────────────────────────────────────
-- Take The Bet — Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Users ────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id                  uuid primary key default gen_random_uuid(),
  clerk_id            text unique not null,
  email               text unique not null,
  full_name           text,
  avatar_url          text,
  date_of_birth       date,
  age_verified        boolean default false,
  role                text default 'fan' check (role in ('fan', 'creator', 'admin')),
  stripe_customer_id  text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── Creators ─────────────────────────────────────────────────────────────────
create table if not exists public.creators (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users(id) on delete cascade unique not null,
  display_name  text not null,
  bio           text,
  photo_url     text,
  slug          text unique not null,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Offerings ─────────────────────────────────────────────────────────────────
create table if not exists public.offerings (
  id                      uuid primary key default gen_random_uuid(),
  creator_id              uuid references public.creators(id) on delete cascade not null,
  title                   text not null,
  description             text,
  total_shares            integer not null check (total_shares > 0),
  shares_available        integer not null check (shares_available >= 0),
  initial_price           numeric(10,2) not null check (initial_price > 0),
  current_price           numeric(10,2) not null check (current_price > 0),
  status                  text default 'draft' check (status in ('draft', 'active', 'closed')),
  primary_commission_rate numeric(5,4) default 0.0700,
  shares_sold             integer default 0,
  total_raised            numeric(14,2) default 0,
  stripe_product_id       text,
  stripe_price_id         text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ── Holdings ─────────────────────────────────────────────────────────────────
create table if not exists public.holdings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete cascade not null,
  offering_id     uuid references public.offerings(id) on delete cascade not null,
  shares_owned    integer default 0 check (shares_owned >= 0),
  avg_buy_price   numeric(10,2) not null,
  total_invested  numeric(14,2) not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique(user_id, offering_id)
);

-- ── Transactions ──────────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id                        uuid primary key default gen_random_uuid(),
  offering_id               uuid references public.offerings(id) not null,
  buyer_id                  uuid references public.users(id) not null,
  shares                    integer not null check (shares > 0),
  price_per_share           numeric(10,2) not null,
  total_amount              numeric(14,2) not null,
  commission_rate           numeric(5,4) not null,
  commission_amount         numeric(14,2) not null,
  net_amount                numeric(14,2) not null,
  stripe_payment_intent_id  text unique,
  status                    text default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at                timestamptz default now()
);

-- ── Price History ─────────────────────────────────────────────────────────────
create table if not exists public.price_history (
  id            uuid primary key default gen_random_uuid(),
  offering_id   uuid references public.offerings(id) on delete cascade not null,
  price         numeric(10,2) not null,
  recorded_at   timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_users_clerk_id           on public.users(clerk_id);
create index if not exists idx_creators_user_id         on public.creators(user_id);
create index if not exists idx_creators_slug            on public.creators(slug);
create index if not exists idx_offerings_creator_id     on public.offerings(creator_id);
create index if not exists idx_offerings_status         on public.offerings(status);
create index if not exists idx_holdings_user_id         on public.holdings(user_id);
create index if not exists idx_holdings_offering_id     on public.holdings(offering_id);
create index if not exists idx_transactions_offering_id on public.transactions(offering_id);
create index if not exists idx_transactions_buyer_id    on public.transactions(buyer_id);
create index if not exists idx_price_history_offering   on public.price_history(offering_id, recorded_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
  before update on public.users
  for each row execute function update_updated_at();

create trigger creators_updated_at
  before update on public.creators
  for each row execute function update_updated_at();

create trigger offerings_updated_at
  before update on public.offerings
  for each row execute function update_updated_at();

create trigger holdings_updated_at
  before update on public.holdings
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- All writes go through API routes using the service-role key (bypasses RLS).
-- Reads use anon key with permissive policies (public market data).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.users          enable row level security;
alter table public.creators       enable row level security;
alter table public.offerings      enable row level security;
alter table public.holdings       enable row level security;
alter table public.transactions   enable row level security;
alter table public.price_history  enable row level security;

-- Public reads
create policy "public_read_creators"      on public.creators      for select using (true);
create policy "public_read_offerings"     on public.offerings     for select using (true);
create policy "public_read_price_history" on public.price_history for select using (true);

-- Authenticated reads (own data only — enforced in app layer via clerk_id)
create policy "public_read_users"        on public.users        for select using (true);
create policy "public_read_holdings"     on public.holdings     for select using (true);
create policy "public_read_transactions" on public.transactions for select using (true);
