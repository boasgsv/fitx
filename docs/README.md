# FitX documentation

FitX is a year-long, two-player fitness competition. Log activities → earn
points → win the week, fill the shared **Team Bank**, and spend **coins** in the
shop. Built with Next.js 16 (App Router) + Supabase + Tailwind, deployable free
on Vercel. The UI is in **Brazilian Portuguese**.

## Contents

| Doc | What's inside |
|-----|---------------|
| [getting-started.md](./getting-started.md) | Run it locally, connect Supabase, log in. Start here. |
| [architecture.md](./architecture.md) | Tech stack, folder layout, request/auth flow, key design choices. |
| [scoring-and-gameplay.md](./scoring-and-gameplay.md) | Points, bonuses, caps, the three currencies, goals, prizes, and the shop. |
| [database.md](./database.md) | Schema, scoring views, RLS, the `setup.sql` / `reset.sql` workflow. |
| [operations.md](./operations.md) | Env vars, email (magic links + nudges), the reset runbook, troubleshooting, deploy. |
| [development-history.md](./development-history.md) | How the project evolved, the decisions behind it, and open threads — for future agents. |

## The 30-second mental model

- **Two players, one championship.** Time nests: **week** → **season**
  (the pilot month, then trimesters) → **championship** (a ~2-year arc).
- **Every log mints two things:** competition points (your ranking) and coins
  (a separate wallet you spend in the shop — spending never hurts your ranking).
- **Three currencies:** *week wins* (the title), *season points* (the solo
  race), and the *Team Bank* (shared, fills the collab prize ladder).
- **Scoring is compute-on-read** — pure SQL views over an append-only
  `activities` table. Rebalance by editing rows, no redeploy.

## Conventions

- All player-facing copy is **pt-BR**. Code identifiers, slugs, and comments
  stay in English.
- The database is edited through two pasteable scripts (`supabase/setup.sql` to
  build, `supabase/reset.sql` to wipe) — see [database.md](./database.md).
