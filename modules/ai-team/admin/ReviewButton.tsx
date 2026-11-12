"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * « Lancer la revue maintenant » : la revue du lundi de la directrice SEA, à la
 * demande. Une minute environ ; la synthèse arrive dans la conversation, les
 * recommandations dans « Vos demandes ».
 */
export function ReviewButton({ name }: { name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/ai-team/review", { method: "POST", credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; created?: number };
      if (!res.ok) throw new Error(data.error ?? "La revue n'a pas pu être faite.");
      setMsg(data.created ? `${data.created} recommandation${data.created > 1 ? "s" : ""} dans « Vos demandes ».` : "Revue faite : rien à vous demander cette fois.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "La revue n'a pas pu être faite.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ait-review">
      <span>
        📅 <strong>Revue du lundi</strong> : chaque lundi vers 10 h, {name} lit la fiche des canaux et vous dépose ses recommandations.
      </span>
      <button type="button" className="ait-review__btn" onClick={run} disabled={busy}>
        {busy ? `${name} prépare sa revue… (une minute environ)` : "Lancer la revue maintenant"}
      </button>
      {msg && <span className="ait-review__msg">{msg}</span>}
    </div>
  );
}
