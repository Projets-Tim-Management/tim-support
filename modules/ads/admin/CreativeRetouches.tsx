"use client";

/* eslint-disable @next/next/no-img-element -- vignettes de l'ancienne version, servies par le stockage. */
import { toast } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Les retouches d'une créa, sur sa carte (plan Publicité, retouche ciblée) :
 * l'historique des consignes de Charlie sur CETTE créa — ce qu'il a demandé,
 * ce que l'IA a changé, la version d'avant — et la demande suivante.
 *
 * Le clic EST la demande : elle part au prochain passage du cron (chaque
 * minute) ; la carte se rafraîchit seule tant qu'une retouche tourne.
 */

export type CardRetouch = {
  id: number | string;
  instruction: string;
  status: string;
  summary: string | null;
  error: string | null;
  author: string | null;
  createdAt: string;
  generalize: boolean;
  before: { hook?: string | null; copy?: { kind: string; text: string; status: string }[]; assets?: { format: string; url: string | null }[]; video?: { renders?: { format: string; url: string }[] | null } | null } | null;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  "en-attente": { label: "En file", tone: "gris" },
  "en-cours": { label: "Retouche en cours…", tone: "bleu" },
  faite: { label: "Faite", tone: "vert" },
  echec: { label: "Échec", tone: "rouge" },
};
const KIND: Record<string, string> = { principal: "Texte principal", titre: "Titre", description: "Description" };
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function CreativeRetouches({ id, retouches }: { id: number | string; retouches: CardRetouch[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [generalize, setGeneralize] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = retouches.some((r) => r.status === "en-attente" || r.status === "en-cours");

  // Tant qu'une retouche tourne, la carte se met à jour toute seule.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [running, router]);

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ads/creatives/${encodeURIComponent(String(id))}/retouche`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, generalize }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      toast.success(generalize ? "Retouche demandée, et consigne ajoutée pour les prochaines créas." : "Retouche demandée : elle arrive dans une à deux minutes.");
      setText("");
      setGeneralize(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ads-retouch" aria-label="Retouches">
      <h4 className="ads-retouch__title">Retouches {retouches.length > 0 && <small>({retouches.length})</small>}</h4>
      {retouches.length > 0 && (
        <ol className="ads-retouch__list">
          {retouches.map((r) => {
            const st = STATUS[r.status] ?? STATUS["en-attente"];
            return (
              <li key={String(r.id)} className="ads-retouch__item">
                <div className="ads-retouch__head">
                  <span className={`tim-status-pill ads-rush-stage ads-rush-stage--${st.tone}`}>{st.label}</span>
                  <span className="ads-retouch__meta">
                    {when(r.createdAt)}
                    {r.author ? ` · ${r.author}` : ""}
                    {r.generalize ? " · aussi pour les prochaines créas" : ""}
                  </span>
                </div>
                <p className="ads-retouch__instruction">« {r.instruction} »</p>
                {r.summary && <p className="ads-retouch__summary">{r.summary}</p>}
                {r.status === "echec" && r.error && <p className="ads-video__error">{r.error}</p>}
                {r.before && r.status === "faite" && (
                  <details className="ads-retouch__before">
                    <summary>Voir la version d&apos;avant</summary>
                    {r.before.hook && (
                      <p>
                        <strong>Accroche :</strong> {r.before.hook}
                      </p>
                    )}
                    {(r.before.copy ?? [])
                      .filter((t) => t.status === "ok")
                      .map((t, i) => (
                        <p key={i}>
                          <strong>{KIND[t.kind] ?? t.kind} :</strong> {t.text}
                        </p>
                      ))}
                    <div className="ads-retouch__thumbs">
                      {(r.before.assets ?? []).filter((a) => a.url).map((a) => (
                        <img key={a.format} src={a.url!} alt={`Ancien visuel ${a.format}`} />
                      ))}
                    </div>
                    {r.before.video?.renders?.[0]?.url && (
                      <a href={r.before.video.renders[0].url} target="_blank" rel="noreferrer">
                        Ancienne vidéo ({r.before.video.renders[0].format})
                      </a>
                    )}
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="ads-retouch__form">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={1000}
          disabled={busy || running}
          placeholder="Ce que vous voulez changer : « une accroche plus directe », « prends le rush planning », « une musique plus posée »…"
          aria-label="Ce que vous voulez changer"
        />
        <div className="ads-retouch__send">
          <label>
            <input type="checkbox" checked={generalize} onChange={(e) => setGeneralize(e.target.checked)} disabled={busy || running} /> Valable aussi pour les prochaines créas de la campagne
          </label>
          <button type="button" className="tim-btn" disabled={busy || running || text.trim().length < 3} onClick={send}>
            {busy ? "…" : running ? "Retouche en cours…" : "Demander la retouche"}
          </button>
        </div>
      </div>
    </section>
  );
}
