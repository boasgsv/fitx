"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // Allowlist: only the two seeded players may request a link.
    const { data: allowed, error: checkError } = await supabase.rpc(
      "email_is_player",
      { check_email: email },
    );
    if (checkError) {
      console.error("email_is_player RPC failed:", checkError);
      setLoading(false);
      setError("Não deu para validar o e-mail agora. Tente de novo.");
      return;
    }
    if (!allowed) {
      setLoading(false);
      setError("Esse e-mail não está na lista de jogadores do FitX.");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Fit<span className="text-primary">X</span>
          </h1>
          <p className="mt-1 text-sm text-muted">A rivalidade do ano todo.</p>
        </div>

        {!configured ? (
          <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            O Supabase ainda não está conectado. Adicione as credenciais do seu
            projeto em <code>.env.local</code> e reinicie.
          </p>
        ) : sent ? (
          <p className="rounded-lg bg-success/10 p-3 text-center text-sm text-success">
            Confira seu e-mail para o link mágico de acesso.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-3 font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? "Enviando…" : "Enviar link mágico"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
