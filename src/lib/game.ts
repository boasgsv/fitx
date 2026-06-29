/**
 * Canonical game configuration for FitX.
 *
 * The point VALUES here mirror the `scoring_rules` rows seeded in the database
 * (see supabase/migrations). The database is the source of truth for scoring
 * (so rules can be retuned without a redeploy); this file is the source of
 * truth for the logging UI (what activities exist, how they're entered) and
 * for the constants the scoring view enforces.
 *
 * Pilot note: these numbers are a starting point to be recalibrated after the
 * 1-month pilot against the observed earning rate.
 */

export type DomainId =
  | "strength"
  | "cardio"
  | "body_comp"
  | "habits"
  | "sports";

export interface Domain {
  id: DomainId;
  name: string;
  emoji: string;
  blurb: string;
}

export const DOMAINS: Domain[] = [
  { id: "strength", name: "Força", emoji: "🏋️", blurb: "Academia e musculação" },
  { id: "cardio", name: "Cardio", emoji: "🏃", blurb: "Corrida, bike, remo" },
  {
    id: "body_comp",
    name: "Composição",
    emoji: "📏",
    blurb: "Pesagens e medidas (registrado, sem pontos diários)",
  },
  {
    id: "habits",
    name: "Hábitos",
    emoji: "✅",
    blurb: "Sono, nutrição, mobilidade, água, passos",
  },
  { id: "sports", name: "Esportes", emoji: "🎾", blurb: "Esportes recreativos" },
];

/** How a value is entered in the logging form. */
export type InputKind =
  | "session" // a one-off session; value defaults to 1
  | "minutes" // duration in minutes
  | "weight" // kg
  | "number"; // generic number (count, cm, %, etc.)

export interface ActivityType {
  /** Stable slug — must match the `activity_types.id` seeded in the DB. */
  id: string;
  domain: DomainId;
  name: string;
  /** Default unit label shown in the UI. */
  unit: string;
  input: InputKind;
  /** Base points for one logged entry (pre-cap, pre-bonus). Mirrors DB. */
  basePoints: number;
  /** Short helper text shown under the field. */
  hint?: string;
  /** Whether a "did it count as a PR / feat?" toggle is offered (+8, max 1/day). */
  prBonus?: boolean;
  /** Whether a "done together?" toggle is offered (+4 each). */
  togetherBonus?: boolean;
  /** For duration activities: bonus points per extra block beyond the base. */
  overage?: { afterMinutes: number; perBlockMinutes: number; points: number; capPoints: number };
}

export const ACTIVITY_TYPES: ActivityType[] = [
  // Strength
  {
    id: "strength_session",
    domain: "strength",
    name: "Treino na academia",
    unit: "treino",
    input: "session",
    basePoints: 10,
    hint: "≥3 exercícios, ≥30 min",
    prBonus: true,
  },
  // Cardio
  {
    id: "cardio_session",
    domain: "cardio",
    name: "Sessão de cardio",
    unit: "min",
    input: "minutes",
    basePoints: 10,
    hint: "≥20 min. +2 a cada 10 min extras (máx +6).",
    prBonus: true,
    overage: { afterMinutes: 20, perBlockMinutes: 10, points: 2, capPoints: 6 },
  },
  // Body composition (no daily points)
  {
    id: "body_weighin",
    domain: "body_comp",
    name: "Pesagem",
    unit: "kg",
    input: "weight",
    basePoints: 0,
    hint: "Registrado para o bônus mensal de tendência — sem pontos diários.",
  },
  {
    id: "body_measurement",
    domain: "body_comp",
    name: "Medida",
    unit: "cm",
    input: "number",
    basePoints: 0,
    hint: "Cintura/quadril/etc. Registrado, sem pontos diários.",
  },
  // Habits
  {
    id: "habit_sleep",
    domain: "habits",
    name: "Dormir ≥7h",
    unit: "✓",
    input: "session",
    basePoints: 3,
  },
  {
    id: "habit_nutrition",
    domain: "habits",
    name: "Meta de nutrição",
    unit: "✓",
    input: "session",
    basePoints: 3,
  },
  {
    id: "habit_mobility",
    domain: "habits",
    name: "Mobilidade ≥10 min",
    unit: "✓",
    input: "session",
    basePoints: 3,
  },
  {
    id: "habit_water",
    domain: "habits",
    name: "Meta de água",
    unit: "✓",
    input: "session",
    basePoints: 2,
  },
  {
    id: "habit_steps",
    domain: "habits",
    name: "Meta de passos",
    unit: "✓",
    input: "session",
    basePoints: 2,
  },
  // Sports
  {
    id: "sports_session",
    domain: "sports",
    name: "Sessão de esporte",
    unit: "sessão",
    input: "session",
    basePoints: 12,
    hint: "≥45 min. +4 para cada um se jogarem juntos.",
    togetherBonus: true,
  },
];

export function activityTypeById(id: string): ActivityType | undefined {
  return ACTIVITY_TYPES.find((a) => a.id === id);
}

export function activitiesForDomain(domain: DomainId): ActivityType[] {
  return ACTIVITY_TYPES.filter((a) => a.domain === domain);
}

// --- Scoring constants enforced by the DB scoring view ---
export const SCORING = {
  /** Max personal points a single day can contribute. */
  DAILY_PP_CAP: 25,
  /** Max personal points a single week can contribute to the weekly contest. */
  WEEKLY_PP_CAP: 120,
  /** Both-Hit multiplier applied to each partner's weekly PP when both qualify. */
  BOTH_HIT_MULTIPLIER: 1.15,
  /** Team-bank bonus when both partners hit their weekly minimum. */
  BOTH_HIT_BANK_BONUS: 25,
  /** Weekly minimum to "qualify": this many active days OR this much PP. */
  WEEKLY_MIN_ACTIVE_DAYS: 4,
  WEEKLY_MIN_PP: 80,
  /** PR / feat bonus points (max one per day). */
  PR_BONUS: 8,
  /** "Played together" bonus per partner. */
  TOGETHER_BONUS: 4,
  /** Computed Team Bank bonus when BOTH log a gym session on the same day. */
  COLLAB_GYM_WEEKDAY_BONUS: 3,
  COLLAB_GYM_WEEKEND_BONUS: 6,
} as const;
