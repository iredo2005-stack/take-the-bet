-- ─────────────────────────────────────────────────────────────────────────────
-- CLOUT local dev seed data.
--
-- Safe to run more than once: every row uses a fixed UUID with
-- `on conflict (id) do nothing`, and the wallet-funding / position-placement
-- RPC calls (which have real side effects — they debit a wallet) are wrapped
-- in DO blocks that swallow the "duplicate client_request_id" error a
-- second run would hit, so re-running this file never double-charges a
-- demo wallet or creates duplicate positions.
--
-- Creator/trader names here are all fictional placeholders (NovaStreamer,
-- PixelKing, ClutchQueen, etc.) — no real streamers, no photo_url values
-- pointing at real people. LiveStreamEmbed and TradeModule both already
-- render a clean "no photo yet / no live stream configured" fallback, so
-- there's nothing to fill in until you wire up real creators.
--
-- Run with (after applying supabase/migrations/001..011 in order):
--   psql "$DATABASE_URL" -f supabase/seed.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Creator-backing user accounts + creator profiles ──────────────────────────
insert into public.users (id, clerk_id, email, full_name, role) values
  ('a0000000-0000-0000-0000-000000000001', 'seed_creator_nova',   'nova@seed.clout',   'NovaStreamer', 'creator'),
  ('a0000000-0000-0000-0000-000000000002', 'seed_creator_pixel',  'pixel@seed.clout',  'PixelKing',    'creator'),
  ('a0000000-0000-0000-0000-000000000003', 'seed_creator_clutch', 'clutch@seed.clout', 'ClutchQueen',  'creator')
on conflict (id) do nothing;

insert into public.creators (id, user_id, display_name, slug, rolling_avg_metric, realtime_metric, is_live) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'NovaStreamer', 'novastreamer', 850000,  940000, true),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'PixelKing',    'pixelking',    1200000, 1340000, true),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'ClutchQueen',  'clutchqueen',  980000,  870000, true)
on conflict (id) do nothing;

-- ── Demo trader accounts (fund these, place positions with these) ────────────
insert into public.users (id, clerk_id, email, full_name, role) values
  ('c0000000-0000-0000-0000-000000000001', 'seed_trader_alphawolf', 'alphawolf@seed.clout', 'Alpha Wolf',    'fan'),
  ('c0000000-0000-0000-0000-000000000002', 'seed_trader_degenq',    'degenq@seed.clout',    'Degen Queen',   'fan'),
  ('c0000000-0000-0000-0000-000000000003', 'seed_trader_0xtrader',  '0xtrader@seed.clout',  '0xTrader',      'fan'),
  ('c0000000-0000-0000-0000-000000000004', 'seed_trader_whale',     'whale@seed.clout',     'Whale Trader',  'fan')
on conflict (id) do nothing;

do $$
declare
  v_trader uuid;
begin
  foreach v_trader in array array[
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'c0000000-0000-0000-0000-000000000002'::uuid,
    'c0000000-0000-0000-0000-000000000003'::uuid,
    'c0000000-0000-0000-0000-000000000004'::uuid
  ]
  loop
    perform public.clout_get_or_create_wallet(v_trader);
    update public.wallets set play_balance_cents = 10000000 where user_id = v_trader; -- $100,000 play money each
  end loop;
end $$;

-- ── Pool 1: single-creator pool (metric vs. baseline — the "regular" case,
--    not a Creator War) ────────────────────────────────────────────────────────
insert into public.clout_pools (
  id, pool_type, creator_a_id, creator_b_id, platform, metric_type, window_label,
  baseline_metric, current_metric, platform_share_bps, creator_a_share_bps, creator_b_share_bps,
  status, expires_at
) values (
  'd0000000-0000-0000-0000-000000000001', 'single',
  'b0000000-0000-0000-0000-000000000001', null,
  'youtube', 'views', '7-Day Views Sprint',
  850000, 940000, 500, 500, 0,
  'open', now() + interval '2 days'
) on conflict (id) do nothing;

-- ── Pool 2: Creator War (PvP) — the hyper-viral head-to-head case ─────────────
insert into public.clout_pools (
  id, pool_type, creator_a_id, creator_b_id, platform, metric_type, window_label,
  baseline_metric, current_metric_a, current_metric_b, baseline_share_a,
  platform_share_bps, creator_a_share_bps, creator_b_share_bps,
  status, expires_at
) values (
  'd0000000-0000-0000-0000-000000000002', 'war',
  'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003',
  'youtube', 'views', 'Viral Views War',
  1000000, 680000, 520000, 0.5,
  500, 250, 250,
  'open', now() + interval '3 days'
) on conflict (id) do nothing;

-- Open positions on both pools — placed through the real clout_place_position
-- RPC (not a raw insert) so up_pool_cents/down_pool_cents and each side's
-- notional aggregate stay internally consistent, exactly like production.
do $$
begin
  perform public.clout_place_position('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'up',   30000, 5,  false, 'seed-pos-1');
  perform public.clout_place_position('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'down', 20000, 1,  false, 'seed-pos-2');
  perform public.clout_place_position('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', 'up',   15000, 10, false, 'seed-pos-3');

  perform public.clout_place_position('c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', 'up',   50000, 1,  false, 'seed-pos-4');
  perform public.clout_place_position('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'down', 35000, 5,  false, 'seed-pos-5');
  perform public.clout_place_position('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'up',   12000, 10, false, 'seed-pos-6');
exception when unique_violation then
  null; -- already seeded on a previous run — the positions and wallet debits already happened
end $$;

-- ── Pool 3: an already-resolved pool, purely to give the win ticker some
--    real, settled 'won' positions to display ────────────────────────────────
insert into public.clout_pools (
  id, pool_type, creator_a_id, creator_b_id, platform, metric_type, window_label,
  baseline_metric, current_metric, final_metric, platform_share_bps, creator_a_share_bps, creator_b_share_bps,
  status, expires_at, resolved_at
) values (
  'd0000000-0000-0000-0000-000000000003', 'single',
  'b0000000-0000-0000-0000-000000000001', null,
  'youtube', 'views', 'Last Week''s Views Sprint',
  500000, 610000, 610000, 500, 500, 0,
  'resolved_up', now() - interval '1 day', now() - interval '1 day'
) on conflict (id) do nothing;

insert into public.clout_pool_positions (id, pool_id, user_id, side, leverage, margin_cents, notional_cents, status, payout_cents, settled_at) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'up', 5,  10000, 50000, 'won', 42000,  now() - interval '20 minutes'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 'up', 10, 10000, 100000, 'won', 105000, now() - interval '10 minutes'),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'up', 1,  20000, 20000, 'won', 21500,  now() - interval '2 minutes')
on conflict (id) do nothing;

-- ── Alpha Chat: give a couple of demo traders active membership in "The
--    Whales" (seeded by migration 011) and drop a few messages in. Your own
--    real Clerk account, once you sign in, starts with 0 ROI/volume and will
--    correctly render the locked overlay — nothing to seed for that, it's
--    just what a brand-new account looks like. ────────────────────────────────
insert into public.clout_chat_members (chat_id, user_id, status)
select id, 'c0000000-0000-0000-0000-000000000001'::uuid, 'active' from public.clout_alpha_chats where name = 'The Whales'
union all
select id, 'c0000000-0000-0000-0000-000000000004'::uuid, 'active' from public.clout_alpha_chats where name = 'The Whales'
on conflict (chat_id, user_id) do update set status = 'active';

insert into public.clout_chat_messages (id, chat_id, user_id, message_text)
select 'f0000000-0000-0000-0000-000000000001'::uuid, id, 'c0000000-0000-0000-0000-000000000001'::uuid, 'loading up on NovaStreamer, momentum is real' from public.clout_alpha_chats where name = 'The Whales'
union all
select 'f0000000-0000-0000-0000-000000000002'::uuid, id, 'c0000000-0000-0000-0000-000000000004'::uuid, 'this PixelKing vs ClutchQueen war pool is printing' from public.clout_alpha_chats where name = 'The Whales'
union all
select 'f0000000-0000-0000-0000-000000000003'::uuid, id, 'c0000000-0000-0000-0000-000000000001'::uuid, 'anyone else max leverage on the war pool?' from public.clout_alpha_chats where name = 'The Whales'
on conflict (id) do nothing;
