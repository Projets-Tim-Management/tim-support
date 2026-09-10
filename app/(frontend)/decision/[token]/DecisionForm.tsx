"use client";

import { useState } from "react";

import { CLIENT_DECISIONS, clientDecisionLabel } from "@/modules/marketing/lib/journey";

/**
 * Les trois réponses, à confirmer.
 *
 * Le bouton cliqué dans l'e-mail arrive présélectionné — il ne reste qu'à
 * valider. Les deux autres restent visibles et cliquables : on se trompe de
 * bouton sur un téléphone, et surtout on peut changer d'avis entre le message
 * et la page.
 *
 * Chaque réponse porte sa CONSÉQUENCE sous son libellé. « Je m'arrête » sans
 * rien de plus se choisit à l'aveugle ; « dites-nous ce qui a manqué » explique
 * pourquoi on la propose aussi franchement que les deux autres.
 */
export default function DecisionForm({
  token,
  suggested,
  current,
}: {
  token: string;
  suggested: string | null;
  current: string | null;
}) {
  const [choice, setChoice] = useState<string | null>(suggested ?? current);
  const [saved, setSaved] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, decision: choice }),
      });
      if (!res.ok) throw new Error();
      setSaved(choice);
    } catch {
      setError("L'enregistrement a échoué. Répondez à notre e-mail, on lit tout.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-bold text-foreground">
        {saved ? "C'est noté, merci." : "Votre décision"}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {saved
          ? `Votre réponse — « ${clientDecisionLabel(saved)} » — est arrivée chez la personne qui suit votre test.`
          : "Votre phase de test se termine. Trois réponses possibles, et la troisième compte autant que les deux autres."}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {CLIENT_DECISIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => setChoice(d.value)}
            aria-pressed={choice === d.value}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              choice === d.value
                ? "border-primary bg-primary-light"
                : "border-border hover:bg-surface"
            }`}
          >
            <span className="block font-semibold text-foreground">{d.label}</span>
            <span className="mt-0.5 block text-sm text-muted">{d.hint}</span>
          </button>
        ))}
      </div>

      {/* Le bouton reste après l'enregistrement : on change d'avis entre deux
          réunions, et il vaut mieux le recueillir ici que par un silence. */}
      <button
        type="button"
        disabled={busy || !choice || choice === saved}
        onClick={() => void confirm()}
        className="mt-6 rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
      >
        {busy ? "Envoi…" : saved ? "Modifier ma réponse" : "Confirmer ma réponse"}
      </button>

      {saved && (
        <p className="mt-4 text-sm text-muted">
          Vous voulez nous en dire plus&nbsp;? Répondez simplement à notre e-mail.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground">{error}</p>
      )}
    </main>
  );
}
