"use client";

import { useState } from "react";

import { SATISFACTION_LEVELS } from "@/modules/marketing/lib/satisfaction";

/**
 * L'écran d'après le clic : ce qui a été enregistré, et de quoi le corriger.
 *
 * Deux choses s'y font, et une seule est obligatoire. La note est déjà prise —
 * l'écran la confirme. Le mot libre est offert, jamais réclamé : c'est
 * précisément parce qu'écrire coûte un effort qu'on a mis des visages.
 *
 * Les cinq visages restent cliquables. Un filtre de messagerie a pu visiter le
 * lien avant le destinataire, ou le doigt a glissé sur un téléphone : dans les
 * deux cas, la correction doit tenir en un clic, pas en un e-mail.
 */
export default function AvisForm({
  token,
  value,
  comment,
}: {
  token: string;
  value: number | null;
  comment: string;
}) {
  const [note, setNote] = useState<number | null>(value);
  const [text, setText] = useState(comment);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const save = async (body: { note?: number; comment?: string }) => {
    setState("saving");
    try {
      const res = await fetch("/api/avis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...body }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
    } catch {
      setState("error");
    }
  };

  const pick = (v: number) => {
    setNote(v);
    void save({ note: v });
  };

  const level = SATISFACTION_LEVELS.find((l) => l.value === note);

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-xl font-bold text-foreground">Merci, c&apos;est noté.</h1>
      <p className="mt-2 text-sm text-muted">
        {level
          ? "Votre retour arrive directement chez la personne qui suit votre test."
          : "Dites-nous comment ça se passe — un clic suffit."}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {SATISFACTION_LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            onClick={() => pick(l.value)}
            aria-pressed={note === l.value}
            className={`flex min-w-[72px] flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs transition ${
              note === l.value
                ? "border-primary bg-primary-light font-semibold text-foreground"
                : "border-border text-muted hover:bg-surface"
            }`}
          >
            <span className="text-2xl leading-none" aria-hidden="true">
              {l.emoji}
            </span>
            {l.label}
          </button>
        ))}
      </div>

      {note !== null ? (
        <p className="mt-3 text-xs text-muted">
          Ce n&apos;est pas ça ? Cliquez sur le bon visage, votre réponse sera remplacée.
        </p>
      ) : null}

      <label className="mt-8 block text-sm font-semibold text-foreground" htmlFor="mot">
        Un mot de plus ? (facultatif)
      </label>
      <textarea
        id="mot"
        rows={4}
        value={text}
        placeholder="Ce qui marche bien, ce qui coince, ce qui manque…"
        onChange={(e) => setText(e.target.value)}
        className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
      />
      <button
        type="button"
        disabled={state === "saving"}
        onClick={() => void save({ comment: text })}
        className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
      >
        {state === "saving" ? "Envoi…" : "Envoyer"}
      </button>

      {state === "saved" ? (
        <p className="mt-3 text-sm font-semibold text-success-text">Bien reçu, merci.</p>
      ) : null}
      {state === "error" ? (
        <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground">
          L&apos;enregistrement a échoué. Répondez à notre e-mail, on lit tout.
        </p>
      ) : null}
    </main>
  );
}
