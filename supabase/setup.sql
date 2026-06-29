-- FitX one-shot setup. Paste this whole file into the Supabase SQL Editor and Run.
-- It runs schema -> scoring -> policies -> seed in order.
-- EDIT the two player emails in the seed section near the bottom before running.

-- ============================================================
-- 1/4  SCHEMA
-- ============================================================
-- FitX schema — core tables.
-- Portable Postgres (also runs under PGlite for offline scoring tests).
-- Supabase-specific RLS / auth / storage live in 0003_policies.sql.

-- People (the two players). `auth_user_id` links to Supabase auth.users.
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique,
  email         text unique not null,
  display_name  text not null,
  color         text not null default 'primary', -- 'primary' | 'accent'
  created_at    timestamptz not null default now()
);

-- The five goal categories.
create table if not exists domains (
  id          text primary key,        -- 'strength' | 'cardio' | 'body_comp' | 'habits' | 'sports'
  name        text not null,
  sort_order  int not null default 0
);

-- The catalog of loggable activities (mirrors src/lib/game.ts).
create table if not exists activity_types (
  id            text primary key,       -- slug, e.g. 'strength_session'
  domain_id     text not null references domains(id),
  name          text not null,
  default_unit  text,
  sort_order    int not null default 0
);

-- The very-long-term arc (a set of trimesters).
create table if not exists championships (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_on   date not null,
  ends_on     date,
  created_at  timestamptz not null default now()
);

-- A trimester (or the 1-month pilot). The competition unit.
create table if not exists seasons (
  id                  uuid primary key default gen_random_uuid(),
  championship_id     uuid references championships(id) on delete set null,
  name                text not null,
  starts_on           date not null,
  ends_on             date not null,
  collab_goal_points  numeric not null default 0,
  -- Individual season-points target for each player (the solo finish line).
  solo_goal_points    numeric not null default 0,
  -- Computed collab bonus to the Team Bank for a day where BOTH players log a
  -- gym session. Tunable per season; weekend is the harder-to-coordinate day.
  collab_gym_weekday_bonus numeric not null default 3,
  collab_gym_weekend_bonus numeric not null default 6,
  is_pilot            boolean not null default false,
  status              text not null default 'active', -- 'active' | 'upcoming' | 'archived'
  created_at          timestamptz not null default now()
);

-- The configurable scoring engine: one row per (season, activity_type).
-- Edit these rows to rebalance the game — no redeploy needed.
create table if not exists scoring_rules (
  id                    uuid primary key default gen_random_uuid(),
  season_id             uuid not null references seasons(id) on delete cascade,
  activity_type_id      text references activity_types(id),
  domain_id             text references domains(id),
  base_points           numeric not null default 0,
  -- duration overage (e.g. cardio): + overage_points per overage_block_min beyond overage_after_min, capped.
  overage_after_min     int,
  overage_block_min     int,
  overage_points        numeric,
  overage_cap_points    numeric,
  -- PR / feat bonus: applies to a log with metadata.pr = true; at most ONE per user per day (enforced in view).
  pr_bonus_points       numeric,
  -- "played together" bonus: applies to a log with metadata.together = true.
  together_bonus_points numeric,
  daily_cap             numeric, -- optional per-activity-type daily cap
  effective_from        date,
  effective_to          date,
  unique (season_id, activity_type_id)
);

-- The append-only source of truth. One row per logged activity.
create table if not exists activities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  season_id         uuid not null references seasons(id) on delete cascade,
  activity_type_id  text not null references activity_types(id),
  occurred_at       timestamptz not null default now(),
  occurred_on       date not null,                -- local date, for daily grouping
  value             numeric not null default 1,   -- minutes / kg / count / 1 for a session
  unit              text,
  metadata          jsonb not null default '{}'::jsonb, -- {sets,reps} | {distance} | {pr:true} | {together:true} ...
  photo_url         text,
  source            text not null default 'manual', -- 'manual' | 'strava'
  external_id       text,                          -- dedupe key for future imports
  created_at        timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists activities_user_season_day_idx
  on activities (season_id, user_id, occurred_on);

-- Winner & collab prizes.
create table if not exists prizes (
  id                  uuid primary key default gen_random_uuid(),
  season_id           uuid references seasons(id) on delete cascade,
  championship_id     uuid references championships(id) on delete cascade,
  name                text not null,
  kind                text not null,            -- 'winner' | 'collab'
  threshold_points    numeric,                  -- for collab: team-bank target
  awarded_to_user_id  uuid references users(id) on delete set null,
  awarded_at          timestamptz,
  created_at          timestamptz not null default now()
);

-- Freeze tokens for sickness/travel/injury. A used token excludes its week
-- from the weekly contest and waives the weekly minimum for the Both-Hit check.
create table if not exists freeze_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  season_id     uuid not null references seasons(id) on delete cascade,
  used_for_week date,                  -- Monday (ISO week start) the freeze applies to; null = unused
  created_at    timestamptz not null default now()
);

-- Shop catalog. Coins are a SEPARATE wallet from competition points: you earn
-- coins as you log (mirrors points) and spend them here without touching your
-- ranking. Items are treats (self-reward), favors (the partner owes you), or
-- meta perks (playful game effects, honored between the two of you).
create table if not exists shop_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  emoji         text,
  cost_coins    numeric not null,
  kind          text not null default 'treat',  -- 'treat' | 'favor' | 'meta'
  effect        text,                            -- meta perk tag, e.g. 'freeze' | 'double_day'
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- Purchases = the coin ledger's debits. Balance = coins earned − coins spent.
create table if not exists shop_purchases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  item_id       uuid references shop_items(id) on delete set null,
  item_name     text not null,        -- snapshot, survives catalog edits
  cost_coins    numeric not null,
  status        text not null default 'purchased', -- 'purchased' | 'redeemed'
  created_at    timestamptz not null default now()
);

create index if not exists shop_purchases_user_idx on shop_purchases (user_id);

-- ============================================================
-- 2/4  SCORING VIEWS
-- ============================================================
-- FitX scoring engine — compute-on-read via layered views.
-- Portable Postgres (runs under PGlite for tests).
--
-- Pipeline:
--   activities -> v_activity_points (per-log points incl. overage/together/PR)
--             -> v_daily_points     (daily PP cap 25, active-day flag)
--             -> v_user_week         (weekly PP cap 120, qualified, frozen)
--             -> v_week_both_hit      (both partners qualified that week?)
--             -> v_user_week_final    (Both-Hit x1.15 multiplier)
--             -> v_week_winner        (the weekly head-to-head winner)
--             -> v_season_leaderboard / v_season_team_bank / v_career_bank

-- Per-log points. PR bonus applies to at most one log per user per day.
create or replace view v_activity_points as
with base as (
  select
    a.id, a.user_id, a.season_id, a.activity_type_id,
    a.occurred_at, a.occurred_on,
    (date_trunc('week', a.occurred_on))::date as week_start,
    a.value, a.metadata,
    coalesce(sr.base_points, 0)
      + case when sr.overage_block_min is not null then
          least(
            greatest(0, floor(
              (a.value - coalesce(sr.overage_after_min, 0))::numeric / sr.overage_block_min
            )) * coalesce(sr.overage_points, 0),
            coalesce(sr.overage_cap_points, 1e9)
          )
        else 0 end
      + case when coalesce((a.metadata->>'together')::boolean, false)
                  and sr.together_bonus_points is not null
          then sr.together_bonus_points else 0 end
      as points_no_pr,
    case when coalesce((a.metadata->>'pr')::boolean, false)
              and sr.pr_bonus_points is not null
      then sr.pr_bonus_points else 0 end as pr_candidate
  from activities a
  join scoring_rules sr
    on sr.season_id = a.season_id
   and sr.activity_type_id = a.activity_type_id
)
select
  b.id, b.user_id, b.season_id, b.activity_type_id,
  b.occurred_at, b.occurred_on, b.week_start, b.value, b.metadata,
  b.points_no_pr
    + case when b.pr_candidate > 0
              and b.occurred_at = (
                select min(b2.occurred_at) from base b2
                where b2.user_id = b.user_id
                  and b2.occurred_on = b.occurred_on
                  and b2.pr_candidate > 0
              )
        then b.pr_candidate else 0 end
    as points
from base b;

-- Daily PP per user (capped at 25). An "active day" has any scoring activity.
create or replace view v_daily_points as
select
  user_id, season_id, occurred_on,
  (date_trunc('week', occurred_on))::date as week_start,
  sum(points)                                as day_points_raw,
  least(sum(points), 25)                     as day_points,
  (count(*) filter (where points > 0)) > 0   as is_active_day
from v_activity_points
group by user_id, season_id, occurred_on;

-- Candidate (user, season, week) tuples: any week with activity or a used freeze.
create or replace view v_user_week_candidates as
select distinct user_id, season_id, week_start from v_daily_points
union
select user_id, season_id, used_for_week as week_start
from freeze_tokens where used_for_week is not null;

-- Per-user weekly totals (weekly PP cap 120), qualification & freeze flags.
create or replace view v_user_week as
with d as (
  select user_id, season_id, week_start,
    least(sum(day_points), 120)               as week_points_capped,
    count(*) filter (where is_active_day)      as active_days
  from v_daily_points
  group by user_id, season_id, week_start
)
select
  c.user_id, c.season_id, c.week_start,
  coalesce(d.week_points_capped, 0) as week_points_capped,
  coalesce(d.active_days, 0)        as active_days,
  exists (
    select 1 from freeze_tokens f
    where f.user_id = c.user_id and f.season_id = c.season_id
      and f.used_for_week = c.week_start
  ) as frozen,
  (
    coalesce(d.active_days, 0) >= 4              -- WEEKLY_MIN_ACTIVE_DAYS
    or coalesce(d.week_points_capped, 0) >= 80   -- WEEKLY_MIN_PP
    or exists (
      select 1 from freeze_tokens f
      where f.user_id = c.user_id and f.season_id = c.season_id
        and f.used_for_week = c.week_start
    )
  ) as qualified
from v_user_week_candidates c
left join d
  on d.user_id = c.user_id and d.season_id = c.season_id and d.week_start = c.week_start;

-- Both-Hit: every player qualified that week (>= 2 players).
create or replace view v_week_both_hit as
select
  season_id, week_start,
  count(*) filter (where qualified) as n_qualified,
  (count(*) filter (where qualified) >= (select count(*) from users))
    and ((select count(*) from users) >= 2) as both_hit
from v_user_week
group by season_id, week_start;

-- Apply the Both-Hit x1.15 multiplier to each partner's weekly PP.
create or replace view v_user_week_final as
select
  uw.user_id, uw.season_id, uw.week_start,
  uw.week_points_capped, uw.active_days, uw.frozen, uw.qualified,
  bh.both_hit,
  round(uw.week_points_capped * case when bh.both_hit then 1.15 else 1 end, 2)
    as week_points_final
from v_user_week uw
join v_week_both_hit bh
  on bh.season_id = uw.season_id and bh.week_start = uw.week_start;

-- The weekly winner: highest final PP, but no winner if any player was frozen
-- that week (contest void) or the top score is tied or zero.
create or replace view v_week_winner as
select season_id, week_start, user_id as winner_user_id
from (
  select
    f.season_id, f.week_start, f.user_id, f.week_points_final,
    row_number() over (
      partition by f.season_id, f.week_start
      order by f.week_points_final desc
    ) as rn,
    bool_or(f.frozen) over (partition by f.season_id, f.week_start) as any_frozen,
    count(*) over (
      partition by f.season_id, f.week_start, f.week_points_final
    ) as tie_count,
    max(f.week_points_final) over (partition by f.season_id, f.week_start) as top_score
  from v_user_week_final f
) t
where rn = 1
  and not any_frozen
  and week_points_final > 0
  and not (tie_count > 1 and week_points_final = top_score);

-- Per-season standings: week wins (the title currency) + total season PP.
create or replace view v_season_leaderboard as
select
  s.id as season_id, u.id as user_id, u.display_name, u.color,
  coalesce(sum(f.week_points_final), 0) as season_points,
  coalesce((
    select count(*) from v_week_winner w
    where w.season_id = s.id and w.winner_user_id = u.id
  ), 0) as week_wins
from seasons s
cross join users u
left join v_user_week_final f on f.season_id = s.id and f.user_id = u.id
group by s.id, u.id, u.display_name, u.color;

-- Days where BOTH players logged a gym session — a computed collab bonus to the
-- Team Bank (no input needed). Weekend (Sat/Sun) pays the bigger amount. The
-- per-day amounts come from the season config columns, so they're tunable.
create or replace view v_collab_gym_days as
with gym_days as (
  select a.season_id, a.occurred_on,
         count(distinct a.user_id) as n_gym_users
  from activities a
  where a.activity_type_id = 'strength_session'
  group by a.season_id, a.occurred_on
)
select
  g.season_id,
  g.occurred_on,
  (extract(dow from g.occurred_on) in (0, 6)) as is_weekend,
  case when extract(dow from g.occurred_on) in (0, 6)
       then s.collab_gym_weekend_bonus
       else s.collab_gym_weekday_bonus end as bonus
from gym_days g
join seasons s on s.id = g.season_id
where g.n_gym_users >= (select count(*) from users)
  and (select count(*) from users) >= 2;

-- Per-season Team Bank: combined final PP + 25 per Both-Hit week
-- + the same-day gym collab bonus.
create or replace view v_season_team_bank as
select
  s.id as season_id, s.collab_goal_points,
  coalesce((
    select sum(f.week_points_final) from v_user_week_final f where f.season_id = s.id
  ), 0)
  + coalesce((
    select count(*) * 25 from v_week_both_hit bh
    where bh.season_id = s.id and bh.both_hit
  ), 0)
  + coalesce((
    select sum(cgd.bonus) from v_collab_gym_days cgd where cgd.season_id = s.id
  ), 0) as team_bank
from seasons s;

-- Career (championship) bank: sum of non-pilot season banks.
create or replace view v_career_bank as
select
  c.id as championship_id,
  coalesce(sum(tb.team_bank), 0) as career_bank
from championships c
join seasons s on s.championship_id = c.id and not s.is_pilot
join v_season_team_bank tb on tb.season_id = s.id
group by c.id;

-- Coin wallet (shop currency). Coins earned = lifetime final points (floored);
-- balance = earned − everything spent in the shop. Separate from the ranking.
create or replace view v_user_coins as
with earned as (
  select u.id as user_id,
         coalesce(floor(sum(f.week_points_final)), 0) as coins_earned
  from users u
  left join v_user_week_final f on f.user_id = u.id
  group by u.id
)
select
  e.user_id,
  e.coins_earned,
  coalesce((
    select sum(p.cost_coins) from shop_purchases p where p.user_id = e.user_id
  ), 0) as coins_spent,
  e.coins_earned - coalesce((
    select sum(p.cost_coins) from shop_purchases p where p.user_id = e.user_id
  ), 0) as coins_balance
from earned e;

-- ============================================================
-- 3/4  RLS / AUTH LINKING / STORAGE  (Supabase only)
-- ============================================================
-- FitX — Supabase-specific: RLS, auth-user linking, storage.
-- This file references the Supabase `auth` schema and is NOT run by the
-- offline PGlite test (which only loads 0001 + 0002 + seed).

-- Map the logged-in auth user to their row in public.users.
create or replace function app_user_id()
returns uuid language sql stable as $$
  select id from public.users where auth_user_id = auth.uid()
$$;

-- When someone signs in for the first time, link their auth account to the
-- pre-seeded users row by matching email (case-insensitive).
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users
     set auth_user_id = new.id
   where lower(email) = lower(new.email)
     and auth_user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Pre-auth allowlist check used by the login screen: is this email one of the
-- seeded players? SECURITY DEFINER so it can read public.users before the user
-- is authenticated. Returns only a boolean (never the list). Callable by anon.
create or replace function email_is_player(check_email text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.users where lower(email) = lower(trim(check_email))
  );
$$;
grant execute on function email_is_player(text) to anon, authenticated;

-- Enable RLS everywhere.
alter table users          enable row level security;
alter table domains        enable row level security;
alter table activity_types enable row level security;
alter table championships  enable row level security;
alter table seasons        enable row level security;
alter table scoring_rules  enable row level security;
alter table activities     enable row level security;
alter table prizes         enable row level security;
alter table freeze_tokens  enable row level security;
alter table shop_items     enable row level security;
alter table shop_purchases enable row level security;

-- The two partners share full read access to everything (transparent rivalry).
do $$
declare t text;
begin
  foreach t in array array[
    'users','domains','activity_types','championships','seasons',
    'scoring_rules','activities','prizes','freeze_tokens',
    'shop_items','shop_purchases'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_select', t);
  end loop;
end $$;

-- Each player may write only their OWN activities and freeze tokens.
create policy activities_insert on activities
  for insert to authenticated with check (user_id = app_user_id());
create policy activities_update on activities
  for update to authenticated using (user_id = app_user_id());
create policy activities_delete on activities
  for delete to authenticated using (user_id = app_user_id());

create policy freeze_insert on freeze_tokens
  for insert to authenticated with check (user_id = app_user_id());
create policy freeze_update on freeze_tokens
  for update to authenticated using (user_id = app_user_id());

-- Each player may only spend their own coins.
create policy shop_purchases_insert on shop_purchases
  for insert to authenticated with check (user_id = app_user_id());

-- Storage bucket for workout photos (run once; ignore if it already exists).
insert into storage.buckets (id, name, public)
values ('activity-photos', 'activity-photos', true)
on conflict (id) do nothing;

create policy "photos read"  on storage.objects
  for select to authenticated using (bucket_id = 'activity-photos');
create policy "photos write" on storage.objects
  for insert to authenticated with check (bucket_id = 'activity-photos');

-- ============================================================
-- 4/4  SEED  (edit the two emails below!)
-- ============================================================
-- FitX seed data. Idempotent. Safe to run on Supabase and under PGlite.
-- Edit the two users' emails to the real addresses before going live.

-- Domains
insert into domains (id, name, sort_order) values
  ('strength',  'Strength',  1),
  ('cardio',    'Cardio',    2),
  ('body_comp', 'Body Comp', 3),
  ('habits',    'Habits',    4),
  ('sports',    'Sports',    5)
on conflict (id) do nothing;

-- Activity catalog (mirrors src/lib/game.ts)
insert into activity_types (id, domain_id, name, default_unit, sort_order) values
  ('strength_session', 'strength',  'Gym session',     'session', 1),
  ('cardio_session',   'cardio',    'Cardio session',  'min',     1),
  ('body_weighin',     'body_comp', 'Weigh-in',        'kg',      1),
  ('body_measurement', 'body_comp', 'Measurement',     'cm',      2),
  ('habit_sleep',      'habits',    'Sleep ≥7h',       '✓',       1),
  ('habit_nutrition',  'habits',    'Nutrition target','✓',       2),
  ('habit_mobility',   'habits',    'Mobility ≥10 min','✓',       3),
  ('habit_water',      'habits',    'Water target',    '✓',       4),
  ('habit_steps',      'habits',    'Steps target',    '✓',       5),
  ('sports_session',   'sports',    'Sports session',  'session', 1)
on conflict (id) do nothing;

-- Championship (the very-long-term arc) + pilot month + first trimester.
-- The long arc runs ~2 years; the dream trip is its apex, not a near-term goal.
insert into championships (id, name, starts_on, ends_on) values
  ('11111111-1111-1111-1111-111111111111', 'Campeonato 2026–2028', '2026-07-01', '2028-06-30')
on conflict (id) do nothing;

insert into seasons (id, championship_id, name, starts_on, ends_on, collab_goal_points, solo_goal_points, is_pilot, status) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Pilot (calibration)', '2026-07-01', '2026-07-31', 600, 300, true, 'active'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Trimester 1', '2026-08-01', '2026-10-31', 2000, 1000, false, 'upcoming')
on conflict (id) do nothing;

-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  EDIT THE TWO EMAILS BELOW before running. Each must EXACTLY match the  │
-- │  address that person requests the magic link with — that's how the     │
-- │  login gets linked to the player. Don't have one yet? Leave the         │
-- │  placeholder, then re-run reset.sql + setup.sql once you do.            │
-- └──────────────────────────────────────────────────────────────────────┘
insert into users (id, email, display_name, color) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'boasgsv@gmail.com',     'Gabriele', 'primary'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PARTNER_EMAIL_HERE@example.com', 'Letícia',  'accent')
on conflict (id) do nothing;

-- Scoring rules for every active/upcoming season (the configurable engine).
insert into scoring_rules (
  season_id, activity_type_id, base_points,
  overage_after_min, overage_block_min, overage_points, overage_cap_points,
  pr_bonus_points, together_bonus_points
)
select s.id, r.activity_type_id, r.base_points, r.oa, r.ob, r.op, r.ocap, r.pr, r.tog
from (values
  ('strength_session', 10, null::int, null::int, null::numeric, null::numeric, 8::numeric, null::numeric),
  ('cardio_session',   10, 20,        10,        2::numeric,    6::numeric,    8::numeric, null::numeric),
  ('body_weighin',      0, null,      null,      null,          null,          null,       null),
  ('body_measurement',  0, null,      null,      null,          null,          null,       null),
  ('habit_sleep',       3, null,      null,      null,          null,          null,       null),
  ('habit_nutrition',   3, null,      null,      null,          null,          null,       null),
  ('habit_mobility',    3, null,      null,      null,          null,          null,       null),
  ('habit_water',       2, null,      null,      null,          null,          null,       null),
  ('habit_steps',       2, null,      null,      null,          null,          null,       null),
  ('sports_session',   12, null,      null,      null,          null,          null,       4::numeric)
) as r(activity_type_id, base_points, oa, ob, op, ocap, pr, tog)
cross join seasons s
where s.status in ('active', 'upcoming')
on conflict (season_id, activity_type_id) do nothing;

-- Prizes — edit the names freely; these are what the help screen shows.
--   kind 'winner' = INDIVIDUAL, won by the stage champion (most week wins).
--   kind 'collab' = SHARED, unlocked when the Team Bank reaches threshold_points.
-- Themed for two people who live apart: rewards center on visits, dates and
-- trips TOGETHER. The collab rows form a rising ladder of milestones.
-- Stable ids make re-running setup.sql idempotent.
insert into prizes (id, season_id, championship_id, name, kind, threshold_points) values
  -- Pilot month — individual + a short collab ladder
  ('ee000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', null,
     'Campeã do piloto: escolhe o programa do próximo encontro',          'winner', null),
  ('ee000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', null,
     'Café da manhã especial no próximo encontro',                        'collab', 300),
  ('ee000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', null,
     'Noite especial juntos (jantar + cinema)',                           'collab', 600),
  -- Trimester 1 — individual + a longer collab ladder
  ('ee000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', null,
     'Campeã do trimestre: o cinturão + o outro paga o próximo rolê',     'winner', null),
  ('ee000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', null,
     'Passeio bacana num fim de semana',                                  'collab', 1000),
  ('ee000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', null,
     'Escapada de fim de semana (1 noite fora)',                          'collab', 2000),
  -- Championship — the 2-year arc, building to the dream trip
  ('ee000000-0000-0000-0000-000000000007', null, '11111111-1111-1111-1111-111111111111',
     'Campeã do campeonato: troféu + mimo escolhido pela vencedora',      'winner', null),
  ('ee000000-0000-0000-0000-000000000008', null, '11111111-1111-1111-1111-111111111111',
     'Fim de semana prolongado juntos',                                   'collab', 4000),
  ('ee000000-0000-0000-0000-000000000009', null, '11111111-1111-1111-1111-111111111111',
     'Viagem curta (3–4 dias)',                                           'collab', 8000),
  ('ee000000-0000-0000-0000-000000000010', null, '11111111-1111-1111-1111-111111111111',
     'Viagem dos sonhos (o grande objetivo de 2 anos)',                   'collab', 16000)
on conflict (id) do nothing;

-- Shop catalog — spend COINS (earned as you log; separate from the ranking).
-- Edit names/costs freely. Stable ids keep re-runs idempotent.
insert into shop_items (id, name, description, emoji, cost_coins, kind, effect, sort_order) values
  -- 🎁 Mimos (treats you grant yourself)
  ('ff000000-0000-0000-0000-000000000001', 'Sobremesa sem culpa',   'Aquela sobremesa que você tava se segurando.',                 '🍰',  40, 'treat', null, 1),
  ('ff000000-0000-0000-0000-000000000002', 'Domingo preguiçoso',    'Um dia inteiro de descanso, sem cobrança de ninguém.',         '🛋️',  80, 'treat', null, 2),
  ('ff000000-0000-0000-0000-000000000003', 'Mini-splurge',          'Compre algo pequeno só pra você.',                             '🛍️', 150, 'treat', null, 3),
  -- 💞 Favores (the partner owes you on the next visit)
  ('ff000000-0000-0000-0000-000000000004', 'Escolhe o filme',       'Você decide o filme do próximo encontro — sem direito a choro.', '🎬',  60, 'favor', null, 4),
  ('ff000000-0000-0000-0000-000000000005', 'Café da manhã por conta', 'Na próxima visita, o café da manhã é por conta dela/dele.',   '🥐', 100, 'favor', null, 5),
  ('ff000000-0000-0000-0000-000000000006', 'Massagem de 15 min',    'Resgatável na próxima vez que vocês se virem.',                '💆', 120, 'favor', null, 6),
  -- 🎮 Meta (playful game perks, honored entre vocês)
  ('ff000000-0000-0000-0000-000000000007', 'Provocação oficial',    'Dispara um "tô na frente 😎" pra deixar a outra com raiva.',     '😈',  30, 'meta', 'taunt', 7),
  ('ff000000-0000-0000-0000-000000000008', 'Freeze',                'Anula uma semana ruim: ela não conta no duelo da semana.',     '🧊', 120, 'meta', 'freeze', 8),
  ('ff000000-0000-0000-0000-000000000009', 'Dia em dobro',          'Escolha um dia e seus pontos contam em dobro (na honra).',     '✨', 200, 'meta', 'double_day', 9)
on conflict (id) do nothing;
