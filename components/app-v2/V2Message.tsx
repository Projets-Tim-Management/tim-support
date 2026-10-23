"use client";

import { useState } from "react";

/**
 * Une question ou une suggestion sur la V2, envoyée au support.
 *
 * Passe par la route des tickets (/api/tickets) et non par un canal à part : le
 * message arrive dans le tableau de bord du support comme les autres, le client
 * reçoit l'accusé de réception habituel avec son numéro, et les réponses par
 * e-mail reviennent dans le ticket. Un second circuit serait un second endroit
 * à surveiller — et celui qu'on oublie.
 */

type Kind = "assistance" | "suggestion";

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "assistance", label: "Une question", hint: "Sur la V2, son arrivée, son usage…" },
  { value: "suggestion", label: "Une suggestion", hint: "Une idée pour vos équipes, un manque…" },
];

const input = "mt-1 w-full rounded-md border border-border px-3 py-2 text-foreground outline-none focus:border-primary";

export default function V2Message() {
  const [kind, setKind] = useState<Kind>("assistance");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ number: number; email: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const company = String(form.get("company") ?? "").trim();
    form.set("type", kind);
    form.set("subject", `App mobile V2 — ${kind === "suggestion" ? "suggestion" : "question"}${company ? ` (${company})` : ""}`);
    form.set("url", window.location.href);
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; ticket_number?: number; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? "Le message n'est pas parti. Réessayez.");
        return;
      }
      setSent({ number: json.ticket_number ?? 0, email: String(form.get("email") ?? "").trim() });
    } catch {
      setError("Le message n'est pas parti — vérifiez votre connexion et réessayez.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-success/40 bg-success-bg p-6">
        <p className="font-semibold text-success-text">Message bien reçu{sent.number ? ` — demande n° ${sent.number}` : ""}.</p>
        <p className="mt-1 text-sm text-foreground/80">
          Un accusé de réception part à {sent.email}. Nous vous répondons par e-mail.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-white p-5 sm:p-8">
      <div role="radiogroup" aria-label="Type de message" className="grid gap-2 sm:grid-cols-2">
        {KINDS.map((k) => {
          const selected = k.value === kind;
          return (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setKind(k.value)}
              className={`rounded-lg border px-4 py-3 text-left transition ${
                selected ? "border-primary bg-primary-light" : "border-border bg-white hover:border-primary/50"
              }`}
            >
              <span className={`block text-sm font-semibold ${selected ? "text-primary" : "text-foreground"}`}>{k.label}</span>
              <span className="mt-0.5 block text-xs text-chip-text">{k.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-foreground">Nom</span>
          <input name="name" required autoComplete="name" maxLength={120} className={input} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-foreground">E-mail</span>
          <input name="email" type="email" required autoComplete="email" className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-foreground">
            Société <span className="font-normal text-muted">(facultatif)</span>
          </span>
          <input name="company" autoComplete="organization" maxLength={120} className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-foreground">Votre message</span>
          <textarea
            name="description"
            required
            minLength={10}
            rows={4}
            maxLength={4000}
            placeholder={kind === "suggestion" ? "Ce qui aiderait vos équipes au quotidien…" : "Votre question…"}
            className={input}
          />
        </label>
        {/* Leurre anti-robot (même champ que le formulaire de contact). */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      </div>

      {error && <p className="mt-4 rounded-md bg-danger-bg px-4 py-3 text-sm text-foreground">{error}</p>}

      <button
        type="submit"
        disabled={sending}
        className="mt-6 rounded-btn bg-primary px-6 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
      >
        {sending ? "Envoi…" : "Envoyer au support"}
      </button>
    </form>
  );
}
