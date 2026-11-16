"use client";

import { useEffect, useRef, useState } from "react";

import { HEARD_FROM, HEARD_FROM_QUESTION } from "@/modules/booking/lib/heard-from";

/**
 * « Comment nous avez-vous connus ? » en un clic (16/11/2026) : des boutons, rien à taper, facultatif. Un clic
 * enregistre et remercie ; un autre clic corrige. `initial` : la réponse venue d'un lien d'e-mail, enregistrée
 * à l'affichage (un antivirus qui ouvre le lien sans afficher la page ne compte pas).
 */
export default function HeardFrom({ jeton, demande, initial }: { jeton?: string | null; demande?: string | null; initial?: string | null }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const sent = useRef(false);

  const send = async (value: string) => {
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/rdv/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reponse: value, jeton, demande }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) setChosen(value);
    else setFailed(true);
  };
  useEffect(() => {
    if (initial && !sent.current) {
      sent.current = true;
      void send(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  if (!jeton && !demande) return null;
  return (
    <div className="mt-6 rounded-lg border border-border bg-surface px-4 py-4 text-left">
      <p className="text-sm font-semibold text-ink">{chosen ? "Merci, c'est noté !" : `Une dernière chose : ${HEARD_FROM_QUESTION.toLowerCase()}`}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {HEARD_FROM.map((h) => (
          <button
            key={h.value}
            type="button"
            disabled={busy}
            onClick={() => void send(h.value)}
            aria-pressed={chosen === h.value}
            className={`rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 ${chosen === h.value ? "border-primary bg-primary text-white" : "border-border bg-white text-foreground hover:border-primary hover:text-primary"}`}
          >
            {h.label}
          </button>
        ))}
      </div>
      {failed && <p className="mt-2 text-xs text-muted">Votre réponse n&apos;a pas pu être enregistrée : réessayez.</p>}
    </div>
  );
}
