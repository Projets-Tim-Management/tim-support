"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * « Lancer … maintenant » : la revue du lundi de Margaux, la veille d'un
 * agent — à la demande. Un spinner pendant le travail, le bouton désactivé
 * (pas de double lancement), puis le résultat ou la raison de l'échec, et la
 * page se rafraîchit. Un seul composant pour les deux (relecture du 12/11/2026).
 */
export function RunNowButton<T extends Record<string, unknown>>({
  url,
  body,
  intro,
  label,
  busyLabel,
  done,
  failed,
}: {
  url: string;
  body?: Record<string, unknown>;
  /** La phrase devant le bouton (ce que fait l'agent, et quand). */
  intro: React.ReactNode;
  label: string;
  busyLabel: string;
  /** Le message de réussite, à partir de la réponse. */
  done: (data: T) => string;
  failed: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", credentials: "include", ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) throw new Error(data.error ?? failed);
      setMsg(done(data));
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : failed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ait-review">
      <span>{intro}</span>
      <button type="button" className="ait-review__btn" onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? (
          <>
            <span className="ait-spinner" aria-hidden /> {busyLabel}
          </>
        ) : (
          label
        )}
      </button>
      {msg && <span className="ait-review__msg">{msg}</span>}
    </div>
  );
}
