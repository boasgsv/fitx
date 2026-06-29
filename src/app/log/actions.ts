"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveSeason, getCurrentAppUser } from "@/lib/data";
import { activityTypeById } from "@/lib/game";
import { sendPartnerNudge } from "@/lib/email";

export interface LogState {
  error?: string;
}

const schema = z.object({
  activityTypeId: z.string().min(1),
  value: z.coerce.number().min(0).max(100000),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(280).optional(),
});

export async function logActivity(
  _prev: LogState,
  formData: FormData,
): Promise<LogState> {
  const user = await getCurrentAppUser();
  if (!user) return { error: "Você não está conectado." };
  const season = await getActiveSeason();
  if (!season) return { error: "Não há temporada ativa." };

  const parsed = schema.safeParse({
    activityTypeId: formData.get("activityTypeId"),
    value: formData.get("value") ?? 1,
    occurredOn: formData.get("occurredOn"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success)
    return { error: "Confira o formulário e tente novamente." };

  const at = activityTypeById(parsed.data.activityTypeId);
  if (!at) return { error: "Tipo de atividade desconhecido." };

  const supabase = await createClient();

  // Optional photo verification.
  let photoUrl: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const ext = photo.name.split(".").pop() ?? "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("activity-photos")
      .upload(path, photo, { contentType: photo.type });
    if (!upErr) {
      photoUrl = supabase.storage.from("activity-photos").getPublicUrl(path)
        .data.publicUrl;
    }
  }

  const metadata: Record<string, unknown> = {};
  if (at.prBonus && formData.get("pr") === "on") metadata.pr = true;
  if (at.togetherBonus && formData.get("together") === "on")
    metadata.together = true;
  if (parsed.data.notes) metadata.notes = parsed.data.notes;

  const value = at.input === "session" ? 1 : parsed.data.value;

  const { error } = await supabase.from("activities").insert({
    user_id: user.id,
    season_id: season.id,
    activity_type_id: at.id,
    occurred_on: parsed.data.occurredOn,
    occurred_at: new Date(`${parsed.data.occurredOn}T12:00:00Z`).toISOString(),
    value,
    unit: at.unit,
    metadata,
    photo_url: photoUrl,
  });
  if (error) return { error: error.message };

  // Tease the partner: "they just trained, your move". Best-effort.
  const { data: partner } = await supabase
    .from("users")
    .select("email, display_name")
    .neq("id", user.id)
    .limit(1)
    .maybeSingle();
  if (partner?.email) {
    await sendPartnerNudge({
      to: partner.email,
      partnerName: partner.display_name,
      actorName: user.display_name,
      activityName: at.name,
    });
  }

  revalidatePath("/");
  redirect("/?logged=1");
}
