# Database

Portable Postgres. The scoring/schema run under both Supabase and PGlite (the
offline test); Supabase-specific bits (auth, storage, RLS) live in `0003`.

## Apply / rebuild workflow

Two pasteable scripts drive everything from the Supabase **SQL Editor**:

- **`supabase/setup.sql`** — one-shot build = `0001 schema` + `0002 scoring` +
  `0003 policies` + `seed`, concatenated. Edit the player emails (and any prize
  names) near the bottom before running.
- **`supabase/reset.sql`** — wipes all data, drops the views/functions/trigger
  and the photo policies, and deletes the magic-link accounts so they re-link
  cleanly on next login.

**To rebuild from scratch:** run `reset.sql`, then `setup.sql`. Safe to repeat.
See the [reset runbook](./operations.md#reset-runbook).

> The `migrations/000{1,2,3}_*.sql` files are the canonical sources; `setup.sql`
> duplicates them for convenience. **Change both** when editing schema, scoring,
> or seed, or they drift. The offline test (`scripts/test-scoring.mjs`) loads
> `0001 + 0002 + seed` only.

## Tables (`0001_schema.sql`)

| Table | Purpose |
|-------|---------|
| `users` | The two players. `auth_user_id` links to `auth.users` (set by trigger on first login). |
| `domains`, `activity_types` | Catalog (mirrors `src/lib/game.ts`). |
| `championships` | The long arc (~2 years). |
| `seasons` | Pilot / trimesters. Holds `collab_goal_points`, `solo_goal_points`, and the per-season `collab_gym_weekday_bonus` / `collab_gym_weekend_bonus`. |
| `scoring_rules` | One row per (season, activity_type) — the tunable point engine. |
| `activities` | **Append-only** source of truth. One row per logged activity. `source`/`external_id` reserved for future Strava import. |
| `prizes` | `kind` = `winner` (individual) or `collab` (Team Bank `threshold_points`). |
| `freeze_tokens` | Sickness/travel/injury — excludes a week from the contest. |
| `shop_items` | Shop catalog: `kind` = `treat`/`favor`/`meta`, `cost_coins`, `effect`. |
| `shop_purchases` | Coin-ledger debits (with an `item_name` snapshot). |

## Scoring views (`0002_scoring.sql`)

Layered, compute-on-read. Each builds on the previous:

```
activities
  → v_activity_points     per-log points (overage, together, PR-once-per-day)
  → v_daily_points        daily cap 25, active-day flag
  → v_user_week           weekly cap 120, qualified, frozen
  → v_week_both_hit        both players qualified this week?
  → v_user_week_final      Both-Hit ×1.15
  → v_week_winner          weekly head-to-head winner
  → v_season_leaderboard   week wins + season points
  → v_season_team_bank     finals + 25/Both-Hit + same-day-gym bonus
  → v_collab_gym_days      days both logged a gym session (+ weekday/weekend bonus)
  → v_career_bank          championship bank (non-pilot seasons)
  → v_user_coins           lifetime points (floored) − shop spend = balance
```

To rebalance, edit `scoring_rules` rows or `seasons` columns — the views
recompute automatically.

## Auth, RLS & functions (`0003_policies.sql`)

- **`app_user_id()`** — maps `auth.uid()` to the player's `users.id`.
- **`handle_new_auth_user()`** + trigger `on_auth_user_created` — on first
  sign-in, links the new auth account to the seeded `users` row by email.
- **`email_is_player(text)`** — `SECURITY DEFINER` boolean used by the login
  screen to allowlist emails *before* auth (returns only true/false; granted to
  `anon`).
- **RLS:** both players have full **read** on everything (transparent rivalry);
  **writes** are restricted to your own rows (`activities`, `freeze_tokens`,
  `shop_purchases` all check `user_id = app_user_id()`).
- **Storage:** a public `activity-photos` bucket with authenticated read/write
  policies (for optional activity photos).

## Seed (`seed.sql`)

Idempotent (`on conflict (id) do nothing`, stable UUIDs). Seeds domains, the
activity catalog, the championship + pilot + Trimester 1, both players (⚠️ edit
emails), `scoring_rules`, the prize ladder, and the shop catalog.
