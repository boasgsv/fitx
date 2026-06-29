import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export interface AppUser {
  id: string;
  email: string;
  display_name: string;
  color: string;
}

export interface Season {
  id: string;
  championship_id: string | null;
  name: string;
  starts_on: string;
  ends_on: string;
  collab_goal_points: number;
  /** Individual season-points target for each player (the solo finish line). */
  solo_goal_points: number;
  is_pilot: boolean;
  status: string;
  /** Regenerated on every re-seed — used to re-trigger the first-run tour. */
  created_at: string;
}

export interface LeaderboardRow {
  season_id: string;
  user_id: string;
  display_name: string;
  color: string;
  season_points: number;
  week_wins: number;
}

export interface ActivityRow {
  id: string;
  user_id: string;
  activity_type_id: string;
  occurred_on: string;
  value: number;
  unit: string | null;
  metadata: Record<string, unknown>;
}

/** The signed-in player's row in `users` (null if not linked / not configured). */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, email, display_name, color")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return data as AppUser | null;
}

/** The current active season (the pilot, then each trimester). */
export async function getActiveSeason(): Promise<Season | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("seasons")
    .select("*")
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Season | null;
}

/** All seasons (id -> name/goal), newest first. For labelling prizes. */
export async function getAllSeasons(): Promise<Season[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("seasons")
    .select("*")
    .order("starts_on", { ascending: true });
  return (data ?? []) as Season[];
}

export async function getLeaderboard(
  seasonId: string,
): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_season_leaderboard")
    .select("*")
    .eq("season_id", seasonId);
  return (data ?? []) as LeaderboardRow[];
}

export async function getTeamBank(
  seasonId: string,
): Promise<{ team_bank: number; collab_goal_points: number }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_season_team_bank")
    .select("team_bank, collab_goal_points")
    .eq("season_id", seasonId)
    .maybeSingle();
  return (
    (data as { team_bank: number; collab_goal_points: number } | null) ?? {
      team_bank: 0,
      collab_goal_points: 0,
    }
  );
}

export interface CoinWallet {
  user_id: string;
  coins_earned: number;
  coins_spent: number;
  coins_balance: number;
}

/** Coin wallets for both players (earned − spent). */
export async function getCoins(): Promise<CoinWallet[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_user_coins")
    .select("user_id, coins_earned, coins_spent, coins_balance");
  return (data ?? []) as CoinWallet[];
}

export interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  cost_coins: number;
  kind: string; // 'treat' | 'favor' | 'meta'
  effect: string | null;
}

export async function getShopItems(): Promise<ShopItem[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("shop_items")
    .select("id, name, description, emoji, cost_coins, kind, effect")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as ShopItem[];
}

export interface Purchase {
  id: string;
  item_name: string;
  cost_coins: number;
  status: string;
  created_at: string;
}

export async function getMyPurchases(userId: string): Promise<Purchase[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("shop_purchases")
    .select("id, item_name, cost_coins, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as Purchase[];
}

export interface WeekPoints {
  user_id: string;
  week_points_final: number;
  qualified: boolean;
  both_hit: boolean;
}

/** Each player's final points for a given week — the short-term (weekly) race. */
export async function getWeekPoints(
  seasonId: string,
  weekStart: string,
): Promise<WeekPoints[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_user_week_final")
    .select("user_id, week_points_final, qualified, both_hit")
    .eq("season_id", seasonId)
    .eq("week_start", weekStart);
  return (data ?? []) as WeekPoints[];
}

/** Career (championship) team bank — the very-long-term team progress. */
export async function getCareerBank(championshipId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_career_bank")
    .select("career_bank")
    .eq("championship_id", championshipId)
    .maybeSingle();
  return Number((data as { career_bank: number } | null)?.career_bank ?? 0);
}

export interface Prize {
  id: string;
  name: string;
  kind: string; // 'winner' | 'collab'
  threshold_points: number | null;
  season_id: string | null;
  championship_id: string | null;
}

/** All configured prizes (few rows; the help screen groups them by scope). */
export async function getPrizes(): Promise<Prize[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("prizes")
    .select("id, name, kind, threshold_points, season_id, championship_id")
    .order("threshold_points", { ascending: true, nullsFirst: true });
  return (data ?? []) as Prize[];
}

export async function getRecentActivities(
  seasonId: string,
  limit = 12,
): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("id, user_id, activity_type_id, occurred_on, value, unit, metadata")
    .eq("season_id", seasonId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ActivityRow[];
}
