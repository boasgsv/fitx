import { SCORING } from "@/lib/game";
import type { LeaderboardRow, Prize, Season, WeekPoints } from "@/lib/data";

// The "horse race": where each of us stands across three horizons, plus how
// close the team is to the next shared prize. Pure presentation — all data is
// fetched on the dashboard and passed in.

function clampPct(v: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (v / max) * 100));
}

const round = (n: number) => Math.round(n);

/** One racer's lane toward an individual goal (the finish flag = the goal). */
function RaceLane({
  name,
  color,
  value,
  goal,
  isMe,
}: {
  name: string;
  color: string;
  value: number;
  goal: number;
  isMe: boolean;
}) {
  const fill = color === "accent" ? "bg-accent" : "bg-primary";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">
          {name}
          {isMe && <span className="text-muted"> (você)</span>}
        </span>
        <span className="text-muted">
          {round(value)}
          {goal > 0 && ` / ${goal}`}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full ${fill} bar-hatch transition-all`}
            style={{ width: `${clampPct(value, goal)}%` }}
          />
        </div>
        <span className="text-xs" title="Meta">
          🏁
        </span>
      </div>
    </div>
  );
}

/** Team progress bar with milestone ticks (the shared-prize ladder). */
function MilestoneBar({
  value,
  max,
  ticks,
}: {
  value: number;
  max: number;
  ticks: number[];
}) {
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-success bar-hatch transition-all"
        style={{ width: `${clampPct(value, max)}%` }}
      />
      {ticks
        .filter((t) => t > 0 && t < max)
        .map((t) => (
          <span
            key={t}
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-background"
            style={{ left: `${clampPct(t, max)}%` }}
          />
        ))}
    </div>
  );
}

function leadLine(players: LeaderboardRow[], meId: string | undefined, value: (p: LeaderboardRow) => number, unit: string) {
  if (players.length < 2 || !meId) return null;
  const me = players.find((p) => p.user_id === meId);
  const other = players.find((p) => p.user_id !== meId);
  if (!me || !other) return null;
  const diff = round(value(me) - value(other));
  if (diff === 0) return `Empate técnico — ${round(value(me))} ${unit} cada.`;
  if (diff > 0) return `Você está ${diff} ${unit} à frente de ${other.display_name}.`;
  return `${other.display_name} está ${-diff} ${unit} à sua frente.`;
}

export function Timeline({
  meId,
  players,
  weekPoints,
  season,
  teamBank,
  careerBank,
  prizes,
}: {
  meId?: string;
  players: LeaderboardRow[];
  weekPoints: WeekPoints[];
  season: Season;
  teamBank: number;
  careerBank: number;
  prizes: Prize[];
}) {
  const weekFor = (id: string) =>
    Number(weekPoints.find((w) => w.user_id === id)?.week_points_final ?? 0);

  // Weekly: individual goal = the qualify line; team goal = both qualifying.
  const weeklyGoal = SCORING.WEEKLY_MIN_PP;
  const weeklyTeamGoal = SCORING.WEEKLY_MIN_PP * 2;
  const weekTeam = players.reduce((s, p) => s + weekFor(p.user_id), 0);

  // Prizes for the season (trimester) and championship (2-year arc).
  const seasonCollab = prizes
    .filter((p) => p.kind === "collab" && p.season_id === season.id)
    .sort((a, b) => (a.threshold_points ?? 0) - (b.threshold_points ?? 0));
  const champCollab = prizes
    .filter((p) => p.kind === "collab" && p.championship_id)
    .sort((a, b) => (a.threshold_points ?? 0) - (b.threshold_points ?? 0));

  const nextPrize = (list: Prize[], current: number) =>
    list.find((p) => (p.threshold_points ?? 0) > current) ?? list[list.length - 1];

  const trimesterGoal =
    season.collab_goal_points ||
    seasonCollab[seasonCollab.length - 1]?.threshold_points ||
    0;
  const champMax = champCollab[champCollab.length - 1]?.threshold_points ?? 0;
  const nextSeasonPrize = nextPrize(seasonCollab, teamBank);
  const nextChampPrize = nextPrize(champCollab, careerBank);

  const weekWinsLead = leadLine(players, meId, (p) => p.week_wins, "vitórias");

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">📊 A corrida</h2>
        <span className="text-xs text-muted">onde cada uma está</span>
      </div>

      {/* SHORT TERM — this week */}
      <div className="space-y-3">
        <Horizon title="Esta semana" hint={`meta: ${weeklyGoal} pts p/ qualificar`} />
        {players.map((p) => (
          <RaceLane
            key={p.user_id}
            name={p.display_name}
            color={p.color}
            value={weekFor(p.user_id)}
            goal={weeklyGoal}
            isMe={p.user_id === meId}
          />
        ))}
        <TeamRow
          label="Time esta semana"
          value={weekTeam}
          goal={weeklyTeamGoal}
          note="os dois qualificando"
          ticks={[]}
        />
      </div>

      {/* LONG TERM — trimester */}
      <div className="space-y-3 border-t border-border pt-4">
        <Horizon
          title={`Temporada · ${season.name}`}
          hint={`meta individual: ${season.solo_goal_points || "—"} pts`}
        />
        {players.map((p) => (
          <RaceLane
            key={p.user_id}
            name={p.display_name}
            color={p.color}
            value={p.season_points}
            goal={season.solo_goal_points}
            isMe={p.user_id === meId}
          />
        ))}
        <TeamRow
          label="Banco do Time"
          value={teamBank}
          goal={trimesterGoal}
          note={
            nextSeasonPrize
              ? `próximo: ${nextSeasonPrize.name} (${nextSeasonPrize.threshold_points})`
              : undefined
          }
          ticks={seasonCollab.map((p) => p.threshold_points ?? 0)}
        />
      </div>

      {/* VERY LONG TERM — 2-year championship */}
      <div className="space-y-3 border-t border-border pt-4">
        <Horizon title="Arco de 2 anos" hint="rumo à viagem dos sonhos" />
        {weekWinsLead && (
          <p className="text-xs text-muted">🏆 Título: {weekWinsLead}</p>
        )}
        <TeamRow
          label="Banco do campeonato"
          value={careerBank}
          goal={champMax}
          note={
            nextChampPrize
              ? `próximo: ${nextChampPrize.name} (${nextChampPrize.threshold_points})`
              : undefined
          }
          ticks={champCollab.map((p) => p.threshold_points ?? 0)}
        />
        {season.is_pilot && (
          <p className="text-[11px] text-muted">
            O banco do campeonato começa a contar no Trimestre 1 (o piloto é
            calibração).
          </p>
        )}
      </div>
    </section>
  );
}

function Horizon({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

function TeamRow({
  label,
  value,
  goal,
  note,
  ticks,
}: {
  label: string;
  value: number;
  goal: number;
  note?: string;
  ticks: number[];
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">🤝 {label}</span>
        <span className="text-muted">
          {round(value)}
          {goal > 0 && ` / ${goal}`}
        </span>
      </div>
      <MilestoneBar value={value} max={goal} ticks={ticks} />
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </div>
  );
}
