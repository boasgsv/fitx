# Operations

## Environment variables

Copy `.env.local.example` → `.env.local`.

| Var | Required | Purpose |
|-----|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon public key |
| `NEXT_PUBLIC_SITE_URL` | recommended | Base URL for magic-link redirects & nudge links (prod = your Vercel URL) |
| `RESEND_API_KEY` | optional | Enables the partner-nudge email; unset → nudge is skipped |
| `RESEND_FROM` | optional | Nudge sender, e.g. `FitX <onboarding@resend.dev>` |

## Scripts

- `npm run dev` — local dev server
- `npm run build` / `npm run start` — production build & serve
- `npm run lint` — ESLint
- `npm run test:scoring` — offline scoring assertions (PGlite, no DB/Docker)

## Email

There are **two** independent email paths:

1. **Magic-link login** — sent by Supabase Auth. The built-in sender is
   rate-limited (a few/hour, only to your own address). For reliable delivery
   and to reach your partner, configure **custom SMTP**:
   - Sign up at <https://resend.com>, get an API key.
   - Supabase → **Authentication → Emails → SMTP Settings**: host
     `smtp.resend.com`, port `465`, user `resend`, password = API key, sender =
     a **verified** address.
   - To email anyone other than your own Resend account address, **verify a
     domain** in Resend (`onboarding@resend.dev` only delivers to the account
     owner). Then bump **Authentication → Rate Limits**.
2. **Partner nudge** — sent by the app via the Resend **HTTP API** (`src/lib/
   email.ts`) when someone logs an activity. Needs `RESEND_API_KEY`. Same
   verified-domain caveat applies for delivering to your partner. It's
   best-effort: failures never block the log.

## Reset runbook

When you need a clean slate (e.g., after schema changes):

1. Edit player emails / prize names in `supabase/setup.sql` if needed.
2. SQL Editor → paste all of **`supabase/reset.sql`** → Run.
   - If you see *"Direct deletion from storage tables is not allowed"*, you're
     on an old copy — the current `reset.sql` only drops storage **policies**.
3. SQL Editor → paste all of **`supabase/setup.sql`** → Run → "Success".
4. Each player logs in fresh; the trigger re-links accounts by email.

This is a **full data wipe** (logged activities are gone) and clears the
magic-link accounts. The onboarding tour re-appears after a reset (it's keyed to
the season's `created_at`).

## Deploy (Vercel)

1. Push to GitHub, import at <https://vercel.com/new>.
2. Set env vars (the `NEXT_PUBLIC_*` ones; `RESEND_*` if using nudges). Use the
   real Vercel URL for `NEXT_PUBLIC_SITE_URL`.
3. Add the Vercel URL to Supabase **Redirect URLs** (`https://your-app/**`).
4. Deploy. Free tier comfortably covers two players.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| **"Esse e-mail não está na lista de jogadores"** | Email isn't a seeded player. Check the `users` seed; emails must match exactly. |
| **"Não deu para validar o e-mail agora"** | The `email_is_player` RPC failed — usually the function isn't deployed. Re-run `setup.sql` (or just that function block) and `notify pgrst, 'reload schema';`. |
| **"Você não está conectado" when logging** | Your `auth.users` account isn't linked to a `users` row (logged in before the trigger existed). Easiest fix: `reset.sql` → `setup.sql`, then log in fresh. |
| **Magic link never arrives** | Built-in sender rate limit — wait, or set up custom SMTP (see [Email](#email)). Every retry resets the limit. |
| **"550 domain is not verified" (Resend)** | Sender must be `onboarding@resend.dev` (testing, your address only) or a verified domain. |
| **Clicked link but bounced to login** | Redirect URL not allowlisted — add `http://localhost:3000/**` under Auth → URL Configuration. |
| **Changes to `.env.local` ignored** | Restart `npm run dev`. |

## Node toolchain note

There's no system Node here; `nvm` is symlinked into `~/.local/bin`. If `npm`
isn't found, open a fresh terminal so it's on `PATH`. You can always run the
scoring test directly with `node scripts/test-scoring.mjs`.
