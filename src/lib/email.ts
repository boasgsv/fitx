// Transactional email via the Resend HTTP API. No SDK dependency — just fetch.
// Everything here is best-effort: if RESEND_API_KEY isn't set, or the send
// fails, we swallow the error so it never blocks the user's action.

const ENDPOINT = "https://api.resend.com/emails";

/** Teasing "your partner just trained" nudge. */
export async function sendPartnerNudge(opts: {
  to: string;
  partnerName: string;
  actorName: string;
  activityName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !opts.to) return; // not configured — skip silently

  const from = process.env.RESEND_FROM ?? "FitX <onboarding@resend.dev>";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const subjects = [
    `👀 ${opts.actorName} acabou de treinar. Vai ficar pra trás?`,
    `🔥 ${opts.actorName} tá suando. E você, ${opts.partnerName}?`,
    `🏃 ${opts.actorName} se mexeu. Sua vez, ${opts.partnerName}!`,
    `😏 ${opts.actorName} marcou pontos. Vai deixar barato?`,
  ];
  const lines = [
    `${opts.actorName} acabou de registrar <b>${opts.activityName}</b> no FitX.`,
    `Enquanto você lê isso, ${opts.actorName} já tá na frente. 😎`,
    `O placar não espera. Bora mostrar serviço?`,
  ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];
  const tagline = lines[Math.floor(Math.random() * lines.length)];

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#18181b">
      <h1 style="font-size:22px;margin:0 0 8px">Fit<span style="color:#4f46e5">X</span></h1>
      <p style="font-size:16px;line-height:1.5;margin:0 0 16px">${tagline}</p>
      <p style="font-size:15px;color:#52525b;margin:0 0 24px">
        Abre o app, registra alguma coisa e revida. 💪
      </p>
      <a href="${site}/log"
         style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
                padding:12px 22px;border-radius:10px;font-weight:600">
        Registrar agora →
      </a>
      <p style="font-size:12px;color:#a1a1aa;margin:24px 0 0">
        Você recebe isso porque está jogando FitX com ${opts.actorName}.
      </p>
    </div>`;

  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [opts.to], subject, html }),
    });
  } catch {
    // best-effort — never block the activity log on a failed email
  }
}
