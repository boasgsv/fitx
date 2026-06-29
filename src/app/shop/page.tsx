import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  getCoins,
  getCurrentAppUser,
  getMyPurchases,
  getShopItems,
  type Purchase,
} from "@/lib/data";
import { ShopList } from "./shop-list";

export const metadata = { title: "Loja · FitX" };

export default async function ShopPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 p-5">
        <p className="text-sm text-muted">Conecte o Supabase para usar a loja.</p>
      </main>
    );
  }

  const me = await getCurrentAppUser();
  const [items, coins, purchases] = await Promise.all([
    getShopItems(),
    getCoins(),
    me ? getMyPurchases(me.id) : Promise.resolve([] as Purchase[]),
  ]);

  const balance = Number(
    coins.find((c) => c.user_id === me?.id)?.coins_balance ?? 0,
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-5 pb-16">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Loja</h1>
        <Link
          href="/"
          className="text-sm text-muted underline-offset-2 hover:underline"
        >
          ← Voltar
        </Link>
      </header>

      {/* Wallet */}
      <div className="mb-6 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-accent/10 p-5">
        <p className="text-xs text-muted">Sua carteira</p>
        <p className="mt-1 text-3xl font-bold">🪙 {balance}</p>
        <p className="mt-1 text-xs text-muted">
          Moedas são ganhas conforme você registra atividades — gastar aqui não
          mexe no seu placar.
        </p>
      </div>

      <ShopList items={items} balance={balance} />

      {/* History */}
      {purchases.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Suas compras</h2>
          <ul className="space-y-1.5">
            {purchases.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span>{p.item_name}</span>
                <span className="text-muted">🪙 {p.cost_coins}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
