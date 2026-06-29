# Scoring & gameplay

The values below live in two mirrored places: `src/lib/game.ts` (UI + the
`SCORING` constants) and the DB (`scoring_rules` rows + `seasons` columns). The
DB is authoritative for point *values*; edit it to rebalance without a redeploy.

## Activities & base points

| Activity | Domain | Base | Notes |
|----------|--------|------|-------|
| Treino na academia | Força | **10** | PR bonus available |
| Sessão de cardio | Cardio | **10** | + overage; PR bonus available |
| Sessão de esporte | Esportes | **12** | "jogado junto" bonus |
| Dormir ≥7h / Nutrição / Mobilidade | Hábitos | **3** | |
| Meta de água / Meta de passos | Hábitos | **2** | |
| Pesagem / Medida | Composição | **0** | tracked only, never scored daily |

## Bonuses

- **Cardio overage:** +2 per extra 10 min beyond 20 min, capped at +6.
- **PR / feat** (gym & cardio): **+8**, at most one per player per day.
- **Jogado junto** (sports): **+4** to each partner (manual toggle).
- **Academia em dupla (same-day gym):** when *both* log a gym session on the
  same calendar day, the **Team Bank** gets **+3 (weekday) / +6 (weekend)** —
  fully computed, no input. Tunable per season via
  `seasons.collab_gym_weekday_bonus` / `collab_gym_weekend_bonus`.
- **Both-Hit (semana cheia):** in a week where *both* players qualify, each
  player's weekly points are ×**1.15** and the Team Bank gets **+25**.

## Caps & qualifying

- **Daily cap:** 25 personal points/day.
- **Weekly cap:** 120 personal points/week.
- **Qualify** for the week: **≥4 active days OR ≥80 weekly points** (or a used
  freeze token).
- **Week winner:** highest *final* weekly points. No winner if it's a tie, zero,
  or anyone used a freeze that week.

## The three currencies

1. **Vitórias na semana (week wins)** — the title; orders the leaderboard and
   decides the **individual prizes**.
2. **Pontos na temporada (season points)** — sum of your final weekly points;
   the individual "solo race".
3. **Banco do Time (Team Bank)** — both players' final points + 25/Both-Hit week
   + same-day-gym bonuses. Fills the **collab prize ladder**.

## Time structure

- **Week** → resets weekly, produces a weekly winner.
- **Season** → the pilot month (calibration, but it has stakes), then trimesters.
  Title = most week wins.
- **Championship** → a ~2-year arc (`2026-07-01 → 2028-06-30`) with a
  never-resetting **career bank** that fuels the biggest shared prizes.

## Goals (three horizons × two levels)

Surfaced on the dashboard's **"A corrida"** (horse-race) timeline.

| Horizon | Individual goal | Team goal |
|---------|-----------------|-----------|
| Weekly | qualify line (80 pts) | both qualifying (160) |
| Season | `seasons.solo_goal_points` (pilot 300, T1 1000) | `seasons.collab_goal_points` (pilot 600, T1 2000) |
| Championship (2 yr) | the title (week wins) | career bank → prize ladder, to 16000 |

## Prizes

Two kinds (`prizes.kind`): **`winner`** (individual, to the stage champion) and
**`collab`** (shared, unlocked when the Team Bank crosses `threshold_points`).
Themed for a couple who live apart (visits / dates / trips together).

| Stage | Individual | Collab ladder (Team Bank) |
|-------|-----------|----------------------------|
| Pilot | escolhe o programa do próximo encontro | 300 café · 600 noite especial |
| Trimestre 1 | cinturão + o outro paga o rolê | 1000 passeio · 2000 escapada |
| Campeonato (2 yr) | troféu + mimo da vencedora | 4000 fds prolongado · 8000 viagem curta · **16000 viagem dos sonhos** |

Edit names/thresholds freely in the seed; they're placeholders with stable IDs.

## Coins & the shop

- **Coins** are a **separate wallet** from competition points:
  `floor(lifetime final points) − coins spent`. Spending **never** changes your
  ranking. (View: `v_user_coins`.)
- The **shop** (`/shop`) sells three kinds (`shop_items.kind`):
  - **🎁 Mimos** — self-treats (sobremesa, domingo preguiçoso, mini-splurge).
  - **💞 Favores** — the partner owes you (escolher filme, café, massagem).
  - **🎮 Perks (meta)** — playful game effects (provocação, freeze, dia em dobro).
- Purchases are recorded in `shop_purchases` (with a name snapshot) and the
  balance is re-checked server-side on every buy.
- **Meta perks are honor-system for now** — buying records the purchase; they're
  not yet wired into the scoring views. Freeze tokens (`freeze_tokens`) exist in
  the schema and are the natural next step to automate.

## Calibration

The pilot month exists to observe the real earning rate. After it, retune
`scoring_rules`, the `seasons.*_goal_points`, the collab-gym bonuses, the prize
thresholds, and the shop costs — all data edits, no redeploy.
