# Architecture

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| Styling | Tailwind CSS v4 (CSS-variable theme in `globals.css`) |
| Backend | Supabase (Postgres + Auth + Storage), accessed via `@supabase/ssr` |
| Validation | zod (server actions) |
| Email | Resend HTTP API (nudges) + Supabase SMTP (magic links) |
| Tests | PGlite (in-process Postgres) for the scoring engine |

> ⚠️ This is **Next.js 16**, which renamed/changed several APIs (notably
> `middleware.ts` → `proxy.ts`, async `cookies()`). When touching framework
> code, check `node_modules/next/dist/docs/` rather than relying on older
> Next.js knowledge.

## Folder layout

```
src/
  proxy.ts                  # Next 16 "middleware": refreshes session, gates routes
  app/
    layout.tsx              # root layout, <html lang="pt-BR">, metadata
    globals.css             # theme tokens (pastel), shadow-soft + bar-hatch utils
    page.tsx                # dashboard: scoreboard + timeline + recent activity
    timeline.tsx            # the "horse race" (weekly/season/championship goals)
    onboarding.tsx          # first-run tour (re-shows after a DB reset)
    login/page.tsx          # magic-link request + email allowlist check
    auth/confirm/route.ts   # magic-link callback (code / token_hash)
    auth/signout/route.ts
    log/                    # log an activity (page + form + server action)
    shop/                   # coin shop (page + list + buy action)
    help/page.tsx           # rules / scoring / prizes reference
  lib/
    game.ts                 # canonical game config (activities, points, constants)
    data.ts                 # all DB reads + shared types
    email.ts                # Resend nudge sender (best-effort)
    supabase/{client,server,proxy,config}.ts
supabase/
  migrations/000{1,2,3}_*.sql  # schema / scoring views / policies (canonical)
  seed.sql                     # seed data (also used by the offline test)
  setup.sql                    # one-shot = migrations + seed concatenated
  reset.sql                    # wipe everything (run before re-running setup.sql)
scripts/test-scoring.mjs       # offline scoring assertions via PGlite
docs/                          # you are here
```

## Request & auth flow

1. **`src/proxy.ts`** runs on every matched request (`src/lib/supabase/proxy.ts`
   does the work). It refreshes the Supabase session cookie and redirects
   unauthenticated users to `/login` (public paths: `/login`, `/auth`).
2. **Login** (`login/page.tsx`) calls the `email_is_player` RPC first (allowlist)
   and only then `signInWithOtp`. The magic link points at
   **`/auth/confirm`**, which exchanges the code/token for a session.
3. First sign-in fires the DB trigger `on_auth_user_created`, which links the
   new `auth.users` row to the pre-seeded `public.users` row **by email**.
4. Server Components/Actions read the session via `lib/supabase/server.ts`
   (`cookies()` is async in Next 16). `getCurrentAppUser()` maps the auth user
   to the player row.

## Data flow

- **Reads:** Server Components call helpers in `lib/data.ts`, which query
  Postgres **views** (scoring is computed on read — see
  [scoring-and-gameplay.md](./scoring-and-gameplay.md)).
- **Writes:** Server Actions (`log/actions.ts`, `shop/actions.ts`) validate with
  zod, insert into base tables, then `revalidatePath`. RLS enforces that each
  player only writes their own rows.
- **`game.ts` is the UI source of truth** for what activities exist and how
  they're entered; the DB's `scoring_rules` is the source of truth for point
  *values*. The two intentionally mirror each other (the constants in `game.ts`
  document what the views enforce).

## Two copies of the SQL, kept in sync

The `migrations/` files are the canonical, ordered definitions. `setup.sql` is a
single pasteable concatenation of `0001 + 0002 + 0003 + seed` for the Supabase
SQL Editor. **Any schema/scoring/seed change must be made in both** the relevant
migration and `setup.sql`. The offline test loads `0001 + 0002 + seed` (it skips
`0003`, which is Supabase-auth-specific). See [database.md](./database.md).

## Key decisions

- **Compute-on-read scoring** keeps `activities` append-only and lets us
  rebalance by editing `scoring_rules` / `seasons` columns — no migration,
  no recompute.
- **Coins are a separate wallet** (a view: lifetime points − shop spend) so
  shopping never distorts the competition.
- **Best-effort side effects:** the partner-nudge email never blocks or fails an
  activity log.
- **pt-BR everywhere** in the UI; see the project memory and `globals.css`.
