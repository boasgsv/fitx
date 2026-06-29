// Offline test for the FitX scoring engine.
// Loads the real migrations + seed into an in-process Postgres (PGlite),
// inserts a hand-computed week of activities, and asserts the views.
//
//   node scripts/test-scoring.mjs
//
// Requires no Docker / no Supabase — PGlite is a WASM Postgres.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const sql = (p) => readFileSync(join(root, p), "utf8");

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PILOT = "22222222-2222-2222-2222-222222222222";

let failures = 0;
function check(label, got, want, tol = 0.001) {
  const g = typeof want === "number" ? Number(got) : got;
  const ok =
    typeof want === "number" ? Math.abs(g - want) <= tol : g === want;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${got}${ok ? "" : `, want ${want}`}`);
  if (!ok) failures++;
}

const db = await PGlite.create();
await db.exec(sql("supabase/migrations/0001_schema.sql"));
await db.exec(sql("supabase/migrations/0002_scoring.sql"));
await db.exec(sql("supabase/seed.sql"));

// Helper to insert an activity.
async function log(user, type, date, time, value = 1, meta = {}) {
  await db.query(
    `insert into activities (user_id, season_id, activity_type_id, occurred_at, occurred_on, value, metadata)
     values ($1,$2,$3,$4::timestamptz,$5::date,$6,$7::jsonb)`,
    [user, PILOT, type, `${date}T${time}Z`, date, value, JSON.stringify(meta)],
  );
}

// --- Week of Mon 2026-07-06 .. Sun 2026-07-12 ---
// User A
await log(A, "strength_session", "2026-07-06", "08:00"); // 10
await log(A, "strength_session", "2026-07-07", "08:00"); // 10
await log(A, "strength_session", "2026-07-08", "08:00"); // 10
await log(A, "cardio_session", "2026-07-09", "08:00", 40); // 10 + floor((40-20)/10)*2=4 => 14
await log(A, "strength_session", "2026-07-10", "08:00", 1, { pr: true }); // 18 (PR)
await log(A, "strength_session", "2026-07-10", "09:00", 1, { pr: true }); // 10 (PR already used) -> Fri=28 capped 25
await log(A, "strength_session", "2026-07-11", "08:00"); // Sat 10
// A week: 10+10+10+14+25+10 = 79, active_days 6

// User B — gym days so BOTH qualify (Both-Hit)
await log(B, "strength_session", "2026-07-06", "08:00"); // 10
await log(B, "strength_session", "2026-07-07", "08:00"); // 10
await log(B, "strength_session", "2026-07-08", "08:00"); // 10
await log(B, "strength_session", "2026-07-09", "08:00"); // 10
await log(B, "strength_session", "2026-07-11", "08:00"); // Sat 10
// B week: 50, active_days 5
// Same-day BOTH-gym days this week: Mon/Tue/Wed (weekday +3 each) + Sat (weekend +6) = 15

// --- Week of Mon 2026-07-13: A logs once, B uses a freeze token ---
await log(A, "strength_session", "2026-07-13", "08:00"); // 10, A not qualified (1 day)
await db.query(
  `insert into freeze_tokens (user_id, season_id, used_for_week) values ($1,$2,'2026-07-13')`,
  [B, PILOT],
);

console.log("\n# Per-activity points (overage + PR-once)");
const cardio = await db.query(
  `select points from v_activity_points where user_id=$1 and activity_type_id='cardio_session'`,
  [A],
);
check("A Thu cardio 40min", cardio.rows[0].points, 14);
const friPr = await db.query(
  `select occurred_at, points from v_activity_points
   where user_id=$1 and occurred_on='2026-07-10' order by occurred_at`,
  [A],
);
check("A Fri 1st strength (PR applied)", friPr.rows[0].points, 18);
check("A Fri 2nd strength (PR not re-applied)", friPr.rows[1].points, 10);

console.log("\n# Weekly totals, qualification, Both-Hit");
async function week(user, wk) {
  const r = await db.query(
    `select week_points_capped, active_days, qualified, frozen, both_hit, week_points_final
     from v_user_week_final where user_id=$1 and week_start=$2::date`,
    [user, wk],
  );
  return r.rows[0];
}
const aw = await week(A, "2026-07-06");
check("A capped weekly PP", aw.week_points_capped, 79);
check("A active days", aw.active_days, 6);
check("A qualified", aw.qualified, true);
check("A both_hit", aw.both_hit, true);
check("A final (79 x1.15)", aw.week_points_final, 90.85);
const bw = await week(B, "2026-07-06");
check("B capped weekly PP", bw.week_points_capped, 50);
check("B qualified (5 active days)", bw.qualified, true);
check("B final (50 x1.15)", bw.week_points_final, 57.5);

console.log("\n# Weekly winner");
const win0706 = await db.query(
  `select winner_user_id from v_week_winner where week_start='2026-07-06'`,
);
check("Winner of 07-06 week is A", win0706.rows[0]?.winner_user_id, A);
const win0713 = await db.query(
  `select count(*)::int n from v_week_winner where week_start='2026-07-13'`,
);
check("No winner in frozen week 07-13", win0713.rows[0].n, 0);
const bFrozen = await week(B, "2026-07-13");
check("B qualified via freeze on 07-13", bFrozen.qualified, true);
check("B frozen flag on 07-13", bFrozen.frozen, true);

console.log("\n# Season leaderboard & team bank");
const lb = await db.query(
  `select user_id, week_wins, season_points from v_season_leaderboard where season_id=$1 order by season_points desc`,
  [PILOT],
);
const aLb = lb.rows.find((r) => r.user_id === A);
const bLb = lb.rows.find((r) => r.user_id === B);
check("A week wins", aLb.week_wins, 1);
check("B week wins", bLb.week_wins, 0);
check("A season points (90.85 + 10)", aLb.season_points, 100.85);
check("B season points", bLb.season_points, 57.5);

console.log("\n# Same-day gym collab bonus");
const collab = await db.query(
  `select count(*)::int n, coalesce(sum(bonus),0) total,
          count(*) filter (where is_weekend)::int weekend_days
   from v_collab_gym_days where season_id=$1`,
  [PILOT],
);
check("Both-gym days (3 weekday + 1 weekend)", collab.rows[0].n, 4);
check("Weekend both-gym days", collab.rows[0].weekend_days, 1);
check("Collab bonus total (3+3+3+6)", collab.rows[0].total, 15);
const sat = await db.query(
  `select bonus from v_collab_gym_days where season_id=$1 and occurred_on='2026-07-11'`,
  [PILOT],
);
check("Sat both-gym pays weekend bonus", sat.rows[0].bonus, 6);

const bank = await db.query(
  `select team_bank from v_season_team_bank where season_id=$1`,
  [PILOT],
);
// finals: 90.85 + 57.5 + 10 + 0 = 158.35, + 25 Both-Hit (1 week) + 15 collab = 198.35
check("Pilot team bank", bank.rows[0].team_bank, 198.35);

console.log(
  failures === 0
    ? "\n✅ All scoring assertions passed."
    : `\n❌ ${failures} assertion(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
