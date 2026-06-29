"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  DOMAINS,
  activitiesForDomain,
  activityTypeById,
  type DomainId,
} from "@/lib/game";
import { logActivity, type LogState } from "./actions";

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export function LogForm() {
  const [domain, setDomain] = useState<DomainId>("strength");
  const activities = useMemo(() => activitiesForDomain(domain), [domain]);
  const [activityId, setActivityId] = useState(activities[0]?.id ?? "");
  const activity = activityTypeById(activityId) ?? activities[0];

  const [state, formAction, pending] = useActionState<LogState, FormData>(
    logActivity,
    {},
  );

  function pickDomain(d: DomainId) {
    setDomain(d);
    const first = activitiesForDomain(d)[0];
    if (first) setActivityId(first.id);
  }

  const showValue = activity && activity.input !== "session";

  return (
    <form action={formAction} className="space-y-6">
      {/* Domain tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {DOMAINS.map((d) => (
          <button
            type="button"
            key={d.id}
            onClick={() => pickDomain(d.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition ${
              domain === d.id
                ? "border-primary bg-primary text-white"
                : "border-border bg-card text-muted"
            }`}
          >
            <span className="mr-1">{d.emoji}</span>
            {d.name}
          </button>
        ))}
      </div>

      {/* Activity picker */}
      <input type="hidden" name="activityTypeId" value={activityId} />
      <div className="grid grid-cols-1 gap-2">
        {activities.map((a) => (
          <button
            type="button"
            key={a.id}
            onClick={() => setActivityId(a.id)}
            className={`rounded-xl border p-4 text-left transition ${
              activityId === a.id
                ? "border-primary bg-primary/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.name}</span>
              <span className="text-sm text-muted">
                {a.basePoints > 0 ? `${a.basePoints} pts` : "registrado"}
              </span>
            </div>
            {a.hint && <p className="mt-1 text-xs text-muted">{a.hint}</p>}
          </button>
        ))}
      </div>

      {/* Value */}
      {showValue && activity && (
        <label className="block">
          <span className="text-sm font-medium">
            {activity.input === "minutes"
              ? "Minutos"
              : activity.input === "weight"
                ? "Peso (kg)"
                : "Valor"}{" "}
            <span className="text-muted">({activity.unit})</span>
          </span>
          <input
            type="number"
            name="value"
            step="any"
            min="0"
            defaultValue={activity.input === "minutes" ? 30 : ""}
            className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
          />
        </label>
      )}

      {/* Bonus toggles */}
      <div className="space-y-3">
        {activity?.prBonus && (
          <label className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <input type="checkbox" name="pr" className="h-5 w-5" />
            <span className="text-sm">
              Novo recorde / feito{" "}
              <span className="text-muted">(+8, máx 1/dia)</span>
            </span>
          </label>
        )}
        {activity?.togetherBonus && (
          <label className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <input type="checkbox" name="together" className="h-5 w-5" />
            <span className="text-sm">
              Feito junto <span className="text-muted">(+4 cada)</span>
            </span>
          </label>
        )}
      </div>

      {/* Date + notes + photo */}
      <label className="block">
        <span className="text-sm font-medium">Data</span>
        <input
          type="date"
          name="occurredOn"
          defaultValue={todayISO()}
          className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">
          Notas <span className="text-muted">(opcional)</span>
        </span>
        <input
          type="text"
          name="notes"
          maxLength={280}
          placeholder="3×5 agachamento @ 80kg…"
          className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">
          Foto <span className="text-muted">(opcional)</span>
        </span>
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture="environment"
          className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-primary"
        />
      </label>

      {state.error && <p className="text-sm text-red-500">{state.error}</p>}

      <div className="flex gap-3">
        <Link
          href="/"
          className="flex-1 rounded-lg border border-border py-3 text-center font-medium"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="flex-[2] rounded-lg bg-primary py-3 font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {pending ? "Registrando…" : "Registrar"}
        </button>
      </div>
    </form>
  );
}
