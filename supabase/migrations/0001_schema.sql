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
