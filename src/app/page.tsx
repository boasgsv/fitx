import Link from "next/link";
import { Onboarding } from "./onboarding";
import { Timeline } from "./timeline";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getActiveSeason,
  getCareerBank,
  getCoins,
  getCurrentAppUser,
  getLeaderboard,
  getPrizes,
  getRecentActivities,
  getTeamBank,
  getWeekPoints,
  type LeaderboardRow,
} from "@/lib/data";
import { activityTypeById } from "@/lib/game";

/** ISO Monday of the current week — matches the DB's date_trunc('week'). */
function currentWeekStart(): string {
  const d = new Date();
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const mondayOffset = (dt.getUTCDay() + 6) % 7; // 0 = Monday
  dt.setUTCDate(dt.getUTCDate() - mondayOffset);
  return dt.toISOString().slice(0, 10);
}

function NotConfigured() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">
          Fit<span className="text-primary">X</span>
        </h1>
        <p className="mt-3 text-sm text-muted">
          Conecte o Supabase para começar: copie{" "}
          <code>.env.local.example</code> para <code>.env.local</code>, preencha
          a URL do projeto e a anon key, rode o SQL em{" "}
          <code>supabase/migrations</code> + <code>seed.sql</code> e reinicie.
        </p>
      </div>
    </main>
  );
}

export default async function Home() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const [me, season] = await Promise.all([
    getCurrentAppUser(),
    getActiveSeason(),
  ]);

  if (!season) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center text-muted">
        Nenhuma temporada ativa ainda. Crie uma em <code>seasons</code>.
      </main>
    );
  }

  const weekStart = currentWeekStart();
  const [leaderboard, bank, recent, weekPoints, prizes, careerBank, coins] =
    await Promise.all([
      getLeaderboard(season.id),
      getTeamBank(season.id),
      getRecentActivities(season.id),
      getWeekPoints(season.id, weekStart),
      getPrizes(),
      season.championship_id
        ? getCareerBank(season.championship_id)
        : Promise.resolve(0),
      getCoins(),
    ]);

  const myCoins = Math.round(
    Number(coins.find((c) => c.user_id === me?.id)?.coins_balance ?? 0),
  );

  const ranked = [...leaderboard].sort(
    (a, b) => b.week_wins - a.week_wins || b.season_points - a.season_points,
  );
  const leader = ranked[0];
  const userById = new Map(leaderboard.map((r) => [r.user_id, r]));

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <Onboarding resetKey={season.created_at} />
      {/* Header */}
      <header className="flex items-center justify-between p-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Fit<span className="text-primary">X</span>
          </h1>
          <p className="text-xs text-muted">
            {season.name}
            {season.is_pilot && " · calibrando"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {me && (
            <Link
              href="/shop"
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold transition hover:border-primary"
              title="Ir para a Loja"
            >
              🪙 {myCoins}
            </Link>
          )}
          <Link
            href="/shop"
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Loja
          </Link>
          <Link
            href="/help"
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Ajuda
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-xs text-muted underline-offset-2 hover:underline">
              {me ? me.display_name : "Sair"} · sair
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 space-y-6 px-5 pb-28">
        {/* Leaderboard */}
        <section className="grid grid-cols-2 gap-3">
          {ranked.map((row) => (
            <PlayerCard
              key={row.user_id}
              row={row}
              isLeader={leader?.user_id === row.user_id && row.week_wins > 0}
              isMe={me?.id === row.user_id}
            />
          ))}
        </section>

        {/* The race: weekly / trimester / 2-year goals, individual + team */}
        <Timeline
          meId={me?.id}
          players={ranked}
          weekPoints={weekPoints}
          season={season}
          teamBank={bank.team_bank}
          careerBank={careerBank}
          prizes={prizes}
        />

        {/* Recent activity */}
        <section>
          <h2 className="mb-2 font-semibold">Atividade recente</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">
              Nada registrado ainda. Toque no + para entrar no placar.
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((a) => {
                const at = activityTypeById(a.activity_type_id);
                const who = userById.get(a.user_id);
                const meta = a.metadata as {
                  pr?: boolean;
                  together?: boolean;
                };
                return (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {at?.name ?? a.activity_type_id}
                        {meta?.pr && " 🔥"}
                        {meta?.together && " 🤝"}
                      </p>
                      <p className="text-xs text-muted">
                        {who?.display_name ?? "—"} · {a.occurred_on}
                      </p>
                    </div>
                    {at && at.input !== "session" && (
                      <span className="text-sm text-muted">
                        {a.value} {a.unit}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      {/* Floating log button */}
      <Link
        href="/log"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-primary px-8 py-4 font-semibold text-white shadow-lg shadow-primary/30 transition active:scale-95"
      >
        + Registrar atividade
      </Link>
    </div>
  );
}

function PlayerCard({
  row,
  isLeader,
  isMe,
}: {
  row: LeaderboardRow;
  isLeader: boolean;
  isMe: boolean;
}) {
  const isAccent = row.color === "accent";
  const num = isAccent ? "text-accent" : "text-primary";
  const grad = isAccent ? "from-accent/20" : "from-primary/20";
  const ring = isLeader
    ? isAccent
      ? "ring-2 ring-accent/40"
      : "ring-2 ring-primary/40"
    : "";
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft ${ring}`}
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${grad} to-transparent`}
      />
      <div className="relative flex items-center justify-between">
        <p className="truncate font-semibold">
          {row.display_name}
          {isMe && <span className="ml-1 text-xs text-muted">(você)</span>}
        </p>
        {isLeader && <span title="Líder">👑</span>}
      </div>
      <p className={`relative mt-2 text-5xl font-extrabold tracking-tight ${num}`}>
        {row.week_wins}
      </p>
      <p className="relative text-xs text-muted">vitórias na semana</p>
      <p className="relative mt-2 text-sm text-muted">
        {Math.round(row.season_points)} pts na temporada
      </p>
    </div>
  );
}
