-- ─────────────────────────────────────────────────────────────────────────────
-- Seeds the two Alpha Chat tiers for the 50-trader private beta.
--
-- clout_grant_chat_access (migration 006) already enforces both bars as
-- separate, independent checks — roi_bps < min_roi_bps and
-- volume_cents < min_volume_cents each raise their own exception — so a
-- trader must clear ROI AND volume together; one lucky small-stakes win
-- (e.g. 92% ROI on a $5 wager) clears the ROI bar but is stopped cold by the
-- volume bar. Nothing in that function needed to change; this migration only
-- seeds the thresholds.
--
-- name gets a uniqueness constraint so this seed is safely re-runnable
-- (on conflict do update) rather than piling up duplicate rows if it's ever
-- applied more than once.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clout_alpha_chats
  drop constraint if exists clout_alpha_chats_name_key;
alter table public.clout_alpha_chats
  add constraint clout_alpha_chats_name_key unique (name);

insert into public.clout_alpha_chats (name, min_roi_bps, min_volume_cents)
values
  -- Alpha Tier 1 (The Whales): 15% rolling 30-day ROI AND $1,000 cumulative volume.
  ('The Whales', 1500, 100000),
  -- Alpha Tier 2 (The Elite DeGens): 25% rolling 30-day ROI AND $5,000 cumulative volume.
  ('The Elite DeGens', 2500, 500000)
on conflict (name) do update
  set min_roi_bps = excluded.min_roi_bps,
      min_volume_cents = excluded.min_volume_cents;
