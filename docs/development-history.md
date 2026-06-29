# Development history

This project was built largely in one long working session and landed as a
single squashed commit, so the normal per-feature git history doesn't exist.
This doc reconstructs the evolution at a high level — **what** was added, the
**decisions** made, and the **gotchas** hit — so future agents can continue the
work with the original intent intact.

> Read this alongside [architecture.md](./architecture.md) and
> [scoring-and-gameplay.md](./scoring-and-gameplay.md). Where this doc says
> "we decided X", X is reflected in the code/SQL today.

## Phase 0 — The core (pre-existing scaffold)

Before the documented session, a working skeleton already existed:

- Next.js 16 (App Router) + Supabase + Tailwind, magic-link auth with
  `proxy.ts` session refresh and route gating.
- The **compute-on-read scoring engine** (layered SQL views), the append-only
  `activities` table, `scoring_rules`, seasons/championship model.
- Dashboard (leaderboard, team bank, recent activity), the log flow,
  `setup.sql` + migrations + seed, and the offline PGlite scoring test.
- UI was in **English**.

## Phase 1 — Localization & the login-linking bug

- **Translated the entire UI to pt-BR** (`game.ts` names, all pages, server-
  action errors, `<html lang>`). This became a standing project rule: all
  player-facing copy is pt-BR; code/slugs/comments stay English.
- Diagnosed **"Você não está conectado" when logging**: the player's
  `auth.users` account wasn't linked to a `users` row. Root cause: the
  `on_auth_user_created` trigger only links accounts created *after* it exists,
  so an account from an earlier login attempt stayed unlinked. This drove the
  decision that schema/seed changes are best applied via a **full reset**.

## Phase 2 — The reset workflow

- Added **`reset.sql`** (wipe data, drop views/functions/trigger + storage
  policies, delete magic-link accounts so they re-link cleanly) and made
  **`setup.sql`** the idempotent one-shot rebuild.
- Gotcha: Supabase **blocks `DELETE` on storage tables** — `reset.sql` only
  drops storage *policies*; the bucket survives and `setup.sql` re-creates
  policies idempotently.

## Phase 3 — Email deliverability (magic links)

- Supabase's built-in email sender is **rate-limited** (a few/hour, own address
  only). Recommended **custom SMTP via Resend**.
- Gotcha: Resend's test sender `onboarding@resend.dev` only delivers to the
  account owner. Reaching the partner requires **verifying a domain**. This
  caveat recurs for the nudge email too.

## Phase 4 — Game depth: bonuses, goals, prizes, tutorial

- **Same-day-gym collab bonus:** when both log a gym session the same day, the
  **Team Bank** gets +3 (weekday) / +6 (weekend). Decisions: lands in the Team
  Bank only (doesn't distort the head-to-head), values are **tunable per
  season** (`seasons.collab_gym_*` columns), computed from logs (no input).
- **Goals at three horizons × two levels** — added `seasons.solo_goal_points`
  (individual season target); team goals reuse `collab_goal_points` and the
  prize ladder. Pilot collab goal set to **600** (a calibration estimate).
- **The "A corrida" timeline** (`timeline.tsx`): a horse-race visualization on
  the dashboard showing where each player stands across week/season/championship
  and how close the team is to the next prize.
- **Onboarding tour** + **/help** rules screen. The tour is keyed to the
  season's `created_at` so it **re-appears after a reset** (a deliberate fix —
  `localStorage` survives DB wipes).
- **Prizes reworked**: split clearly into `winner` (individual) vs `collab`
  (Team Bank ladder); themed for a couple who **live apart** (visits/dates/trips
  together, no cohabitation assumptions); the dream trip is the **apex of a
  ~2-year championship** (`2026-07-01 → 2028-06-30`), not a near-term goal.

## Phase 5 — Email allowlist

- Added **`email_is_player(text)`** (`SECURITY DEFINER`, granted to `anon`): the
  login screen checks it *before* `signInWithOtp` and rejects non-players in
  pt-BR. Returns only a boolean (no list leak).
- Gotcha: the "Não deu para validar o e-mail" error means the RPC failed —
  almost always because the function wasn't deployed yet (`notify pgrst, 'reload
  schema'` after creating it).

## Phase 6 — Partner nudge email

- On a successful activity log, the **other** player gets a teasing pt-BR email
  (`src/lib/email.ts`, Resend HTTP API). It's **best-effort** (env-gated on
  `RESEND_API_KEY`, failures swallowed) so it never blocks the log.

## Phase 7 — Shop & coins

- **Coins are a separate wallet** (decision: spending must not affect the
  ranking). `v_user_coins` = `floor(lifetime final points) − shop spend`.
- **`/shop`** with `shop_items` (treats / favors / meta) + `shop_purchases`
  ledger; purchase action re-checks balance server-side; RLS limits spends to
  your own wallet.
- **Meta perks (freeze, dia em dobro, taunt) are honor-system** — recorded as
  purchases but **not yet wired into the scoring views** (see follow-ups).

## Phase 8 — UI polish

- Pastel palette (periwinkle / rose / mint), soft card shadows, **hatched**
  progress bars, solid (non-gradient) primary button, explicit shop link.

## Phase 9 — Cleanup & docs

- Removed unused Create-Next-App SVGs, rewrote the README as a slim pointer,
  created this `docs/` set, aligned `seed.sql` with `setup.sql`.

---

## Cross-cutting conventions (don't break these)

- **pt-BR** for all player-facing copy.
- **Two copies of SQL:** `migrations/000{1,2,3}` are canonical; `setup.sql` is
  the concatenated one-shot. Change **both**. The offline test loads
  `0001 + 0002 + seed` (skips Supabase-auth-only `0003`).
- **Compute-on-read scoring** — rebalance via `scoring_rules` / `seasons`
  columns, never a migration/recompute.
- **Best-effort side effects** (emails) never block user actions.
- After any schema/scoring/seed change, run `npm run test:scoring` and rebuild;
  apply to the DB via `reset.sql` → `setup.sql`.

## Open threads / good next steps

- **Wire meta perks into scoring.** `freeze_tokens` already exists and the views
  honor it — connect the shop "Freeze" purchase to it. "Dia em dobro" needs a
  per-day multiplier in `v_daily_points`/`v_activity_points`. "Provocação" could
  trigger a Resend email.
- **Seed future seasons.** Only the pilot + Trimester 1 exist; later trimesters
  need seeding (and `status` transitions pilot→archived, T1→active).
- **Calibrate after the pilot.** Retune `scoring_rules`, `*_goal_points`, the
  collab-gym bonuses, prize thresholds, and shop costs from real data.
- **Strava import** is reserved (`activities.source` / `external_id`) but not
  built.
- **Roadmap:** charts/trends, PWA install + push reminders.
- **Partner email delivery** still needs a verified Resend domain to reach a
  non-owner address.
