# Getting started

Two phases: **(A) see it run locally in ~2 min** (no Supabase yet), then
**(B) connect Supabase** so login, scoring, and the shop work (~10 min).

---

## Phase A — Run it locally

```bash
cd ~/dev/fitx
npm install
npm run dev
```

Open <http://localhost:3000>. You'll see a **"Conecte o Supabase para começar"**
screen — that's expected; the app runs without a database. Stop with `Ctrl+C`
when ready for Phase B.

> If `npm` isn't found, see the Node note in [operations.md](./operations.md).

---

## Phase B — Connect Supabase

### 1. Create a free Supabase project
At <https://supabase.com/dashboard>, **New project** → Free plan, nearest region.
Wait ~2 min for it to provision.

### 2. Configure env
```bash
cp .env.local.example .env.local
```
From **Project Settings → API**, copy the **Project URL** and the **anon public**
key into `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="paste-the-anon-public-key"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```
(The optional `RESEND_*` vars enable the partner-nudge email — see
[operations.md](./operations.md).)

### 3. Set the player emails, then build the database
1. Open `supabase/setup.sql`. Near the **bottom** (SEED section), set the two
   players' emails. **Each email must exactly match the address that person
   signs in with** — that's how a login links to a player.
2. In the Supabase **SQL Editor → New query**, paste the **entire** contents of
   `supabase/setup.sql` and **Run**. You should see "Success". This installs the
   schema, the scoring engine, RLS/auth, the prize ladder, the shop catalog, and
   the seed in one shot.

> Rebuilding later? Run `supabase/reset.sql` first, then `setup.sql`. See the
> [reset runbook](./operations.md#reset-runbook).

### 4. Allow the login redirect
Dashboard → **Authentication → URL Configuration**:
- **Site URL** = `http://localhost:3000`
- **Redirect URLs** → add `http://localhost:3000/**` and Save.

### 5. Run and log in
```bash
npm run dev
```
Open the app → enter **your** seeded email → **Enviar link mágico** → click the
link in your inbox → you land on the dashboard. Tap **+ Registrar atividade** and
log something.

> Magic-link email is rate-limited on Supabase's built-in sender. For reliable
> delivery (and to email your partner), set up custom SMTP — see
> [operations.md](./operations.md#email).

### 6. Get your partner in
She opens the app, enters **her** seeded email, clicks her magic link. Both of
you are now on the board.

---

## Verify the scoring engine (offline, no DB)
```bash
npm run test:scoring
```
Runs the real SQL scoring views in an in-process Postgres (PGlite) and asserts
caps, the Both-Hit multiplier, the same-day-gym bonus, PR rules, freeze
handling, week wins, and the Team Bank.
