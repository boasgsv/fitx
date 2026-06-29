import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getActiveSeason,
  getAllSeasons,
  getPrizes,
  type Prize,
  type Season,
} from "@/lib/data";
import { DOMAINS, SCORING, activitiesForDomain } from "@/lib/game";

export const metadata = {
  title: "Como funciona · FitX",
};

export default async function HelpPage() {
  const configured = isSupabaseConfigured();
  const [season, seasons, prizes] = configured
    ? await Promise.all([getActiveSeason(), getAllSeasons(), getPrizes()])
    : [null, [] as Season[], [] as Prize[]];

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-5 pb-16">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Como funciona</h1>
        <Link
          href="/"
          className="text-sm text-muted underline-offset-2 hover:underline"
        >
          ← Voltar
        </Link>
      </header>

      <p className="mb-8 text-sm text-muted">
        O FitX é uma disputa fitness de um ano entre vocês dois. Você registra
        atividades, ganha pontos e tenta vencer cada semana — mas quanto mais os
        dois se mexem, mais o time todo ganha.
      </p>

      {/* Points per activity */}
      <Section title="🎯 Como ganhar pontos">
        <div className="space-y-5">
          {DOMAINS.map((d) => (
            <div key={d.id}>
              <h3 className="mb-2 text-sm font-semibold">
                <span className="mr-1">{d.emoji}</span>
                {d.name}
                <span className="ml-2 font-normal text-muted">{d.blurb}</span>
              </h3>
              <ul className="space-y-1">
                {activitiesForDomain(d.id).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span>{a.name}</span>
                    <span className="text-muted">
                      {a.basePoints > 0
                        ? `${a.basePoints} pts`
                        : "só acompanhamento"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Bonuses */}
      <Section title="✨ Bônus">
        <ul className="space-y-3 text-sm">
          <Bonus
            label="Cardio mais longo"
            value="+2 a cada 10 min além de 20 (máx +6)"
          />
          <Bonus
            label="Novo recorde / feito"
            value={`+${SCORING.PR_BONUS}, no máximo 1 por dia`}
          />
          <Bonus
            label="Esporte jogado junto"
            value={`+${SCORING.TOGETHER_BONUS} para cada um`}
          />
          <Bonus
            label="Academia em dupla no mesmo dia 🤝"
            value={`+${SCORING.COLLAB_GYM_WEEKDAY_BONUS} no Banco do Time (dia de semana) · +${SCORING.COLLAB_GYM_WEEKEND_BONUS} no fim de semana — calculado automaticamente`}
          />
          <Bonus
            label="Semana cheia (os dois qualificam)"
            value={`pontos da semana ×${SCORING.BOTH_HIT_MULTIPLIER} para cada um + ${SCORING.BOTH_HIT_BANK_BONUS} no Banco do Time`}
          />
        </ul>
      </Section>

      {/* Limits & winning */}
      <Section title="⚖️ Limites e como vencer a semana">
        <ul className="space-y-2 text-sm text-muted">
          <li>
            • Teto de <strong className="text-foreground">{SCORING.DAILY_PP_CAP} pontos por dia</strong> e{" "}
            <strong className="text-foreground">{SCORING.WEEKLY_PP_CAP} por semana</strong> para cada um.
          </li>
          <li>
            • Você <strong className="text-foreground">qualifica</strong> na
            semana com {SCORING.WEEKLY_MIN_ACTIVE_DAYS} dias ativos{" "}
            <em>ou</em> {SCORING.WEEKLY_MIN_PP} pontos.
          </li>
          <li>
            • Vence a semana quem tiver a{" "}
            <strong className="text-foreground">maior pontuação final</strong>.
            Empate, zero ou semana com freeze não dá vencedor.
          </li>
        </ul>
      </Section>

      {/* Currencies */}
      <Section title="🏅 As três moedas">
        <ul className="space-y-2 text-sm text-muted">
          <li>
            • <strong className="text-foreground">Vitórias na semana</strong> — o
            título principal, ordena o placar e decide os{" "}
            <strong className="text-foreground">prêmios individuais</strong>.
          </li>
          <li>
            • <strong className="text-foreground">Pontos na temporada</strong> —
            a soma de tudo que você fez.
          </li>
          <li>
            • <strong className="text-foreground">Banco do Time</strong> — o
            esforço dos dois somado; enche os{" "}
            <strong className="text-foreground">prêmios em dupla</strong>.
          </li>
        </ul>
      </Section>

      {/* Prizes */}
      <Section title="🎁 Prêmios">
        {prizes.length === 0 ? (
          <p className="text-sm text-muted">
            Os prêmios aparecem aqui depois de conectar o Supabase.
          </p>
        ) : (
          <PrizeList prizes={prizes} seasons={seasons} activeId={season?.id} />
        )}
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Bonus({
  label,
  value,
  hidden,
}: {
  label: string;
  value?: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2">
      <span className="font-medium">{label}</span>
      {value && <span className="block text-muted">{value}</span>}
    </li>
  );
}

function PrizeList({
  prizes,
  seasons,
  activeId,
}: {
  prizes: Prize[];
  seasons: Season[];
  activeId?: string;
}) {
  const seasonName = (id: string | null) =>
    seasons.find((s) => s.id === id)?.name ?? "Temporada";

  function scopeLabel(p: Prize) {
    if (p.championship_id) return "Campeonato · arco de 2 anos";
    if (p.season_id === activeId) return `${seasonName(p.season_id)} · agora`;
    return seasonName(p.season_id);
  }

  // Individual prizes go to the stage champion; collab prizes are a rising
  // ladder of Team Bank milestones (already ordered by threshold).
  const winners = prizes.filter((p) => p.kind === "winner");
  const collab = prizes.filter((p) => p.kind === "collab");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">🏆 Individuais</h3>
        <p className="mb-2 mt-0.5 text-xs text-muted">
          Levados por quem for <strong>campeã/campeão</strong> da etapa (mais
          vitórias na semana).
        </p>
        <ul className="space-y-2">
          {winners.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-border bg-card px-4 py-3"
            >
              <p className="text-sm font-medium">{p.name}</p>
              <p className="mt-0.5 text-xs text-muted">{scopeLabel(p)}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold">🤝 Em dupla — escada do Banco</h3>
        <p className="mb-2 mt-0.5 text-xs text-muted">
          Vocês enchem o <strong>Banco do Time</strong> juntos. Cada meta
          atingida desbloqueia o prêmio — sobe degrau a degrau.
        </p>
        <ul className="space-y-2">
          {collab.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
            >
              <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                {p.threshold_points ?? 0}
              </span>
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="mt-0.5 text-xs text-muted">{scopeLabel(p)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
