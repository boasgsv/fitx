"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Keyed by a per-install token (the season's created_at), so a database reset
// re-seeds a new token and the tour shows again on the next visit.
const STORAGE_PREFIX = "fitx_onboarded:";

const SLIDES = [
  {
    emoji: "🏆",
    title: "Bem-vindo ao FitX",
    body: "A disputa fitness de um ano — você contra a sua dupla. Registre atividades, ganhe pontos e tente vencer cada semana.",
  },
  {
    emoji: "💪",
    title: "Registre tudo",
    body: "Toque em “+ Registrar atividade”. Academia, cardio, esportes e hábitos valem pontos. Pesagens e medidas ficam só como acompanhamento.",
  },
  {
    emoji: "🤝",
    title: "Joguem juntos",
    body: "Treinaram no mesmo dia? O Banco do Time ganha um bônus automático (maior no fim de semana). E se os dois baterem a meta da semana, os pontos rendem ×1,15 para cada um.",
  },
  {
    emoji: "🎁",
    title: "Prêmios de verdade",
    body: "Há prêmios individuais (de quem vence a etapa) e prêmios em dupla, que vocês desbloqueiam juntos enchendo o Banco do Time — de pequenos encontros até a viagem dos sonhos. Tudo na tela de Ajuda.",
  },
];

export function Onboarding({ resetKey }: { resetKey: string }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const storageKey = STORAGE_PREFIX + resetKey;

  // Only decide visibility on the client (localStorage isn't available on the
  // server) — avoids a hydration mismatch by starting closed.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading client-only localStorage after mount is the SSR-safe way to gate a first-run tour
      if (!localStorage.getItem(storageKey)) setOpen(true);
    } catch {
      // localStorage blocked — just skip the tour.
    }
  }, [storageKey]);

  function finish() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }

  if (!open) return null;

  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex justify-end">
          <button
            onClick={finish}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Pular
          </button>
        </div>

        <div className="mb-6 mt-2 text-center">
          <div className="text-5xl">{slide.emoji}</div>
          <h2 className="mt-4 text-xl font-bold">{slide.title}</h2>
          <p className="mt-2 text-sm text-muted">{slide.body}</p>
        </div>

        {/* Dots */}
        <div className="mb-5 flex justify-center gap-2">
          {SLIDES.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-5 bg-primary" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {last ? (
            <>
              <Link
                href="/help"
                onClick={finish}
                className="flex-1 rounded-lg border border-border py-3 text-center text-sm font-medium"
              >
                Ver as regras
              </Link>
              <button
                onClick={finish}
                className="flex-1 rounded-lg bg-primary py-3 text-sm font-semibold text-white"
              >
                Começar
              </button>
            </>
          ) : (
            <button
              onClick={() => setI((n) => n + 1)}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-white"
            >
              Próximo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
