"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAppUser } from "@/lib/data";

export interface BuyState {
  error?: string;
  ok?: string;
}

export async function buyItem(
  _prev: BuyState,
  formData: FormData,
): Promise<BuyState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Você não está conectado." };

  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: "Item inválido." };

  const supabase = await createClient();

  const { data: item } = await supabase
    .from("shop_items")
    .select("id, name, cost_coins, is_active")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || !item.is_active) return { error: "Esse item não está disponível." };

  const { data: wallet } = await supabase
    .from("v_user_coins")
    .select("coins_balance")
    .eq("user_id", user.id)
    .maybeSingle();
  const balance = Number(wallet?.coins_balance ?? 0);
  if (balance < Number(item.cost_coins)) {
    return { error: "Moedas insuficientes para esse item." };
  }

  const { error } = await supabase.from("shop_purchases").insert({
    user_id: user.id,
    item_id: item.id,
    item_name: item.name,
    cost_coins: item.cost_coins,
  });
  if (error) return { error: error.message };

  revalidatePath("/shop");
  revalidatePath("/");
  return { ok: `Comprado: ${item.name}! 🎉` };
}
