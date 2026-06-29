-- FitX hard reset. Paste this whole file into the Supabase SQL Editor and Run,
-- THEN paste and Run setup.sql to rebuild from scratch.
--
-- This DROPS ALL FitX data and DELETES the magic-link auth accounts, so that
-- when each player logs in again the on_auth_user_created trigger re-links them
-- to the freshly-seeded users row by email. Safe to run repeatedly.
--
-- Order: auth users -> storage -> trigger/functions -> views -> tables.

-- 1) Auth accounts. Removes the existing magic-link logins so they re-link on
--    next sign-in. (Only the two players exist here — this clears all of them.)
delete from auth.users;

-- 2) Storage: drop the photo policies. The bucket itself is left in place —
--    Supabase blocks deleting storage rows from SQL, and setup.sql re-creates
--    the policies with `on conflict do nothing` on the bucket anyway. To also
--    clear old photo files, empty the 'activity-photos' bucket from the
--    dashboard (Storage -> activity-photos -> select all -> delete).
drop policy if exists "photos read"  on storage.objects;
drop policy if exists "photos write" on storage.objects;

-- 3) Auth-linking trigger + helper functions.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_auth_user() cascade;
drop function if exists app_user_id() cascade;
drop function if exists email_is_player(text) cascade;

-- 4) Scoring views (dropped explicitly; table cascade below would also remove them).
drop view if exists v_user_coins           cascade;
drop view if exists v_career_bank          cascade;
drop view if exists v_season_team_bank      cascade;
drop view if exists v_season_leaderboard    cascade;
drop view if exists v_week_winner           cascade;
drop view if exists v_user_week_final       cascade;
drop view if exists v_week_both_hit         cascade;
drop view if exists v_user_week             cascade;
drop view if exists v_user_week_candidates  cascade;
drop view if exists v_daily_points          cascade;
drop view if exists v_activity_points       cascade;

-- 5) Tables (cascade also clears RLS policies and any remaining dependents).
drop table if exists
  shop_purchases,
  shop_items,
  freeze_tokens,
  prizes,
  activities,
  scoring_rules,
  seasons,
  championships,
  activity_types,
  domains,
  users
cascade;
