"use client";

import { useActionState } from "react";
import type { ShopItem } from "@/lib/data";
import { buyItem, type BuyState } from "./actions";

const GROUPS: { key: string; title: string }[] = [
  { key: "treat", title: "🎁 Mimos pra você" },
  { key: "favor", title: "💞 Favores da dupla" },
  { key: "meta", title: "🎮 Perks do jogo" },
];

export function ShopList({
  items,
  balance,
}: {
  items: ShopItem[];
  balance: number;
}) {
  const [state, formAction, pending] = useActionState<BuyState, FormData>(
    buyItem,
    {},
  );

  return (
    <div className="space-y-6">
      {state.error && (
        <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg bg-success/10 px-4 py-3 text-sm text-success">
          {state.ok}
        </p>
      )}

      {GROUPS.map((g) => {
        const groupItems = items.filter((i) => i.kind === g.key);
        if (groupItems.length === 0) return null;
        return (
          <section key={g.key}>
            <h2 className="mb-2 text-sm font-semibold">{g.title}</h2>
            <ul className="space-y-2">
              {groupItems.map((item) => {
                const affordable = balance >= item.cost_coins;
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
                  >
                    <span className="text-2xl">{item.emoji ?? "🎁"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted">{item.description}</p>
                      )}
                    </div>
                    <form action={formAction} className="shrink-0">
                      <input type="hidden" name="itemId" value={item.id} />
                      <button
                        type="submit"
                        disabled={pending || !affordable}
                        className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
                        title={affordable ? "" : "Moedas insuficientes"}
                      >
                        🪙 {item.cost_coins}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
