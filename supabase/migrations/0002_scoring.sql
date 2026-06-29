-- FitX scoring engine — compute-on-read via layered views.
-- Portable Postgres (runs under PGlite for tests).
--
-- Pipeline:
--   activities -> v_activity_points (per-log points incl. overage/together/PR)
--             -> v_daily_points     (daily PP cap 25, active-day flag)
--             -> v_user_week         (weekly PP cap 120, qualified, frozen)
--             -> v_week_both_hit      (both partners qualified that week?)
--             -> v_user_week_final    (Both-Hit x1.15 multiplier)
--             -> v_week_winner        (the weekly head-to-head winner)
--             -> v_season_leaderboard / v_season_team_bank / v_career_bank

-- Per-log points. PR bonus applies to at most one log per user per day.
create or replace view v_activity_points as
with base as (
  select
    a.id, a.user_id, a.season_id, a.activity_type_id,
    a.occurred_at, a.occurred_on,
    (date_trunc('week', a.occurred_on))::date as week_start,
    a.value, a.metadata,
    coalesce(sr.base_points, 0)
      + case when sr.overage_block_min is not null then
          least(
            greatest(0, floor(
              (a.value - coalesce(sr.overage_after_min, 0))::numeric / sr.overage_block_min
            )) * coalesce(sr.overage_points, 0),
            coalesce(sr.overage_cap_points, 1e9)
          )
        else 0 end
      + case when coalesce((a.metadata->>'together')::boolean, false)
                  and sr.together_bonus_points is not null
          then sr.together_bonus_points else 0 end
      as points_no_pr,
    case when coalesce((a.metadata->>'pr')::boolean, false)
              and sr.pr_bonus_points is not null
      then sr.pr_bonus_points else 0 end as pr_candidate
  from activities a
  join scoring_rules sr
    on sr.season_id = a.season_id
   and sr.activity_type_id = a.activity_type_id
)
select
  b.id, b.user_id, b.season_id, b.activity_type_id,
  b.occurred_at, b.occurred_on, b.week_start, b.value, b.metadata,
  b.points_no_pr
    + case when b.pr_candidate > 0
              and b.occurred_at = (
                select min(b2.occurred_at) from base b2
                where b2.user_id = b.user_id
                  and b2.occurred_on = b.occurred_on
                  and b2.pr_candidate > 0
              )
        then b.pr_candidate else 0 end
    as points
from base b;

-- Daily PP per user (capped at 25). An "active day" has any scoring activity.
create or replace view v_daily_points as
select
  user_id, season_id, occurred_on,
  (date_trunc('week', occurred_on))::date as week_start,
  sum(points)                                as day_points_raw,
  least(sum(points), 25)                     as day_points,
  (count(*) filter (where points > 0)) > 0   as is_active_day
from v_activity_points
group by user_id, season_id, occurred_on;

-- Candidate (user, season, week) tuples: any week with activity or a used freeze.
create or replace view v_user_week_candidates as
select distinct user_id, season_id, week_start from v_daily_points
union
select user_id, season_id, used_for_week as week_start
from freeze_tokens where used_for_week is not null;

-- Per-user weekly totals (weekly PP cap 120), qualification & freeze flags.
create or replace view v_user_week as
with d as (
  select user_id, season_id, week_start,
    least(sum(day_points), 120)               as week_points_capped,
    count(*) filter (where is_active_day)      as active_days
  from v_daily_points
  group by user_id, season_id, week_start
)
select
  c.user_id, c.season_id, c.week_start,
  coalesce(d.week_points_capped, 0) as week_points_capped,
  coalesce(d.active_days, 0)        as active_days,
  exists (
    select 1 from freeze_tokens f
    where f.user_id = c.user_id and f.season_id = c.season_id
      and f.used_for_week = c.week_start
  ) as frozen,
  (
    coalesce(d.active_days, 0) >= 4              -- WEEKLY_MIN_ACTIVE_DAYS
    or coalesce(d.week_points_capped, 0) >= 80   -- WEEKLY_MIN_PP
    or exists (
      select 1 from freeze_tokens f
      where f.user_id = c.user_id and f.season_id = c.season_id
        and f.used_for_week = c.week_start
    )
  ) as qualified
from v_user_week_candidates c
left join d
  on d.user_id = c.user_id and d.season_id = c.season_id and d.week_start = c.week_start;

-- Both-Hit: every player qualified that week (>= 2 players).
create or replace view v_week_both_hit as
select
  season_id, week_start,
  count(*) filter (where qualified) as n_qualified,
  (count(*) filter (where qualified) >= (select count(*) from users))
    and ((select count(*) from users) >= 2) as both_hit
from v_user_week
group by season_id, week_start;

-- Apply the Both-Hit x1.15 multiplier to each partner's weekly PP.
create or replace view v_user_week_final as
select
  uw.user_id, uw.season_id, uw.week_start,
  uw.week_points_capped, uw.active_days, uw.frozen, uw.qualified,
  bh.both_hit,
  round(uw.week_points_capped * case when bh.both_hit then 1.15 else 1 end, 2)
    as week_points_final
from v_user_week uw
join v_week_both_hit bh
  on bh.season_id = uw.season_id and bh.week_start = uw.week_start;

-- The weekly winner: highest final PP, but no winner if any player was frozen
-- that week (contest void) or the top score is tied or zero.
create or replace view v_week_winner as
select season_id, week_start, user_id as winner_user_id
from (
  select
    f.season_id, f.week_start, f.user_id, f.week_points_final,
    row_number() over (
      partition by f.season_id, f.week_start
      order by f.week_points_final desc
    ) as rn,
    bool_or(f.frozen) over (partition by f.season_id, f.week_start) as any_frozen,
    count(*) over (
      partition by f.season_id, f.week_start, f.week_points_final
    ) as tie_count,
    max(f.week_points_final) over (partition by f.season_id, f.week_start) as top_score
  from v_user_week_final f
) t
where rn = 1
  and not any_frozen
  and week_points_final > 0
  and not (tie_count > 1 and week_points_final = top_score);

-- Per-season standings: week wins (the title currency) + total season PP.
create or replace view v_season_leaderboard as
select
  s.id as season_id, u.id as user_id, u.display_name, u.color,
  coalesce(sum(f.week_points_final), 0) as season_points,
  coalesce((
    select count(*) from v_week_winner w
    where w.season_id = s.id and w.winner_user_id = u.id
  ), 0) as week_wins
from seasons s
cross join users u
left join v_user_week_final f on f.season_id = s.id and f.user_id = u.id
group by s.id, u.id, u.display_name, u.color;

-- Days where BOTH players logged a gym session — a computed collab bonus to the
-- Team Bank (no input needed). Weekend (Sat/Sun) pays the bigger amount. The
-- per-day amounts come from the season config columns, so they're tunable.
create or replace view v_collab_gym_days as
with gym_days as (
  select a.season_id, a.occurred_on,
         count(distinct a.user_id) as n_gym_users
  from activities a
  where a.activity_type_id = 'strength_session'
  group by a.season_id, a.occurred_on
)
select
  g.season_id,
  g.occurred_on,
  (extract(dow from g.occurred_on) in (0, 6)) as is_weekend,
  case when extract(dow from g.occurred_on) in (0, 6)
       then s.collab_gym_weekend_bonus
       else s.collab_gym_weekday_bonus end as bonus
from gym_days g
join seasons s on s.id = g.season_id
where g.n_gym_users >= (select count(*) from users)
  and (select count(*) from users) >= 2;

-- Per-season Team Bank: combined final PP + 25 per Both-Hit week
-- + the same-day gym collab bonus.
create or replace view v_season_team_bank as
select
  s.id as season_id, s.collab_goal_points,
  coalesce((
    select sum(f.week_points_final) from v_user_week_final f where f.season_id = s.id
  ), 0)
  + coalesce((
    select count(*) * 25 from v_week_both_hit bh
    where bh.season_id = s.id and bh.both_hit
  ), 0)
  + coalesce((
    select sum(cgd.bonus) from v_collab_gym_days cgd where cgd.season_id = s.id
  ), 0) as team_bank
from seasons s;

-- Career (championship) bank: sum of non-pilot season banks.
create or replace view v_career_bank as
select
  c.id as championship_id,
  coalesce(sum(tb.team_bank), 0) as career_bank
from championships c
join seasons s on s.championship_id = c.id and not s.is_pilot
join v_season_team_bank tb on tb.season_id = s.id
group by c.id;

-- Coin wallet (shop currency). Coins earned = lifetime final points (floored);
-- balance = earned − everything spent in the shop. Separate from the ranking.
create or replace view v_user_coins as
with earned as (
  select u.id as user_id,
         coalesce(floor(sum(f.week_points_final)), 0) as coins_earned
  from users u
  left join v_user_week_final f on f.user_id = u.id
  group by u.id
)
select
  e.user_id,
  e.coins_earned,
  coalesce((
    select sum(p.cost_coins) from shop_purchases p where p.user_id = e.user_id
  ), 0) as coins_spent,
  e.coins_earned - coalesce((
    select sum(p.cost_coins) from shop_purchases p where p.user_id = e.user_id
  ), 0) as coins_balance
from earned e;
