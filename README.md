# FitX 🏋️🤝

A year-long, two-player fitness competition. Every activity you log mints
competition **points** (your head-to-head rivalry) and **coins** (a separate
wallet for the shop) — and feeds a shared **Team Bank** toward prizes you both
unlock. Built with Next.js 16 + Supabase + Tailwind, deployable free on Vercel.
The UI is in **Brazilian Portuguese**.

## Quick start

```bash
npm install
npm run dev          # runs without a DB (shows a "connect Supabase" screen)
npm run test:scoring # verify the scoring engine offline (no DB needed)
```

To wire up login + scoring, follow **[docs/getting-started.md](./docs/getting-started.md)**.

## Documentation

Full docs live in **[`docs/`](./docs/README.md)**:

- [Getting started](./docs/getting-started.md) — run locally, connect Supabase, log in
- [Architecture](./docs/architecture.md) — stack, folder layout, request/auth flow
- [Scoring & gameplay](./docs/scoring-and-gameplay.md) — points, bonuses, goals, prizes, shop
- [Database](./docs/database.md) — schema, scoring views, RLS, the setup/reset workflow
- [Operations](./docs/operations.md) — env, email, reset runbook, troubleshooting, deploy

## How it works in one breath

Time nests **week → season → championship**. Scoring is **compute-on-read** —
pure SQL views over an append-only `activities` table — so you rebalance by
editing rows, never a redeploy. The database is driven by two pasteable scripts:
`supabase/setup.sql` (build) and `supabase/reset.sql` (wipe).
