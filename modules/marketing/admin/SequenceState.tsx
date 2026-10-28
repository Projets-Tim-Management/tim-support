"use client";

import { toast, useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { EmailPreview } from "@/core/admin/EmailPreview";

import "./sequence-state.scss";

/**
 * Où en est le prospect dans sa séquence de relance — bloc de la barre latérale.
 *
 * Une séquence court sur plus d'un an sans que personne n'y touche. Sans cet
 * écran, la seule façon de savoir ce qu'un prospect a reçu — et ce qu'il va
 * recevoir la semaine prochaine — est d'aller lire une ligne de la collection
 * « Séquences de relance », ce que personne ne fait avant de décrocher son
 * téléphone. On le met donc là où on regarde : sur la fiche.
 *
 * Chaque message ouvre son RENDU — celui qui partira à cette personne-là, avec
 * son prénom et la signature de son partenaire. C'est ce qu'on veut relire avant
 * de décrocher : savoir ce qu'elle a déjà lu, et ce qu'elle va recevoir.
 *
 * Une séquence en cours s'arrête d'ici — c'est sur la fiche qu'on décide de
 * couper, au sortir d'un appel. Mais jamais sans MOTIF : le bouton ouvre un
 * choix de motif (et une précision), car « a répondu », « s'est désinscrit » et
 * « coupé après un appel » n'appellent pas le même geste commercial ensuite.
 */

type Message = {
  key?: string;
  scheduledAt?: string;
  sentAt?: string | null;
  skipped?: string | null;
};

type Run = {
  id: number | string;
  sequence?: string;
  sequenceLabel?: string;
  status?: string;
  stopReason?: string;
  stopNote?: string;
  startedAt?: string;
  messages?: Message[];
};

const STATUS: Record<string, { label: string; tone: string }> = {
  "en-cours": { label: "En cours", tone: "live" },
  terminee: { label: "Terminée", tone: "done" },
  arretee: { label: "Arrêtée", tone: "stop" },
};

const STOP: Record<string, string> = {
  reponse: "le prospect a répondu",
  manuelle: "arrêtée à la main",
  desinscription: "désinscription",
  "statut-change": "sortie de « Perdue »",
};

/** Les motifs qu'un humain peut donner (« sortie de Perdue » est posé par le système). */
const MANUAL_REASONS: { value: string; label: string }[] = [
  {
    value: "manuelle",
    label: "Coupée à la main (après un appel, un échange…)",
  },
  { value: "reponse", label: "Le prospect a répondu" },
  { value: "desinscription", label: "Il ne veut plus recevoir d'e-mails" },
];

const SKIPPED: Record<string, string> = {
  desinscrit: "non envoyé — désinscrit",
  echec: "non envoyé — échec",
};

const day = (iso?: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

export const SequenceState: React.FC = () => {
  const { id } = useDocumentInfo();
  const [runs, setRuns] = useState<Run[] | null>(null);
  /** Titres des messages, par clé de séquence : la ligne n'en porte que la clé. */
  const [titles, setTitles] = useState<Record<string, string>>({});
  /** Message dont le rendu est ouvert (null = aucun). */
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  /** La séquence dont on est en train de confirmer l'arrêt. */
  const [stopping, setStopping] = useState<number | string | null>(null);
  const [reason, setReason] = useState("manuelle");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const stop = async (run: Run) => {
    setSending(true);
    try {
      const res = await fetch(`/payload-api/sequence-runs/${run.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "arretee",
          stopReason: reason,
          stopNote: note.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.errors?.[0]?.message ?? `Arrêt impossible (erreur ${res.status}).`);
        return;
      }
      setRuns((list) =>
        (list ?? []).map((r) =>
          r.id === run.id
            ? {
                ...r,
                status: "arretee",
                stopReason: reason,
                stopNote: note.trim(),
              }
            : r,
        ),
      );
      toast.success("Séquence arrêtée : plus aucun message ne partira.");
      setStopping(null);
      setNote("");
      setReason("manuelle");
    } catch {
      toast.error("Arrêt impossible : le serveur n'a pas répondu.");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    let alive = true;

    (async () => {
      const res = await fetch(
        `/payload-api/sequence-runs?where[client][equals]=${id}&sort=-startedAt&limit=5&depth=0`,
        { credentials: "include" },
      ).catch(() => null);
      const docs: Run[] = res?.ok ? ((await res.json()).docs ?? []) : [];
      if (!alive) return;
      setRuns(docs);

      // Les titres vivent sur le MODÈLE, pas sur la séquence en cours : celle-ci
      // ne garde que des clés, pour rester lisible même si un texte est réécrit.
      const keys = [...new Set(docs.map((r) => r.sequence).filter(Boolean))];
      if (keys.length === 0) return;
      const q = keys.map((k) => `where[key][in]=${encodeURIComponent(String(k))}`).join("&");
      const mres = await fetch(`/payload-api/sequences?${q}&limit=10&depth=0`, {
        credentials: "include",
      }).catch(() => null);
      if (!alive || !mres?.ok) return;
      const map: Record<string, string> = {};
      for (const m of (await mres.json()).docs ?? []) {
        for (const msg of m.messages ?? []) {
          if (msg?.key) map[`${m.key}/${msg.key}`] = msg.title ?? msg.subject ?? msg.key;
        }
      }
      setTitles(map);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  if (!id || runs === null || runs.length === 0) return null;

  return (
    <div className="seq-state">
      <div className="seq-state__label">Séquence de relance</div>

      {runs.map((run) => {
        const messages = run.messages ?? [];
        const total = messages.length;
        const done = messages.filter((m) => m.sentAt || m.skipped).length;
        const status = STATUS[run.status ?? ""] ?? {
          label: run.status ?? "—",
          tone: "stop",
        };
        // Le prochain message : ce qui intéresse vraiment avant de décrocher.
        const next = messages.find((m) => !m.sentAt && !m.skipped);

        return (
          <div key={run.id} className="seq-state__run">
            <div className="seq-state__head">
              <a href={`/admin/collections/sequence-runs/${run.id}`} className="seq-state__name">
                {run.sequenceLabel ?? run.sequence}
              </a>
              <span className={`seq-state__badge is-${status.tone}`}>{status.label}</span>
            </div>

            <div className="seq-state__step">
              {run.status === "terminee"
                ? `${total} message${total > 1 ? "s" : ""} envoyé${total > 1 ? "s" : ""}`
                : `Étape ${Math.min(done + 1, total)} sur ${total}`}
              {run.status === "arretee" && run.stopReason ? ` — ${STOP[run.stopReason] ?? run.stopReason}` : ""}
            </div>

            <ol className="seq-state__list">
              {messages.map((m) => {
                const title = titles[`${run.sequence}/${m.key}`] ?? m.key;
                const state = m.sentAt ? "sent" : m.skipped ? "skip" : m === next ? "next" : "wait";
                return (
                  <li key={m.key} className={`seq-state__msg is-${state}`}>
                    <span className="seq-state__dot" aria-hidden="true" />
                    <span className="seq-state__text">
                      <button
                        type="button"
                        className="seq-state__title"
                        title="Voir le rendu de cet e-mail"
                        onClick={() =>
                          setPreview({
                            url: `/api/sequences/preview?run=${run.id}&message=${encodeURIComponent(String(m.key))}`,
                            title: `${title} — ${run.sequenceLabel ?? run.sequence}`,
                          })
                        }
                      >
                        {title}
                      </button>
                      <span className="seq-state__when">
                        {m.sentAt
                          ? `envoyé le ${day(m.sentAt)}`
                          : m.skipped
                            ? (SKIPPED[m.skipped] ?? m.skipped)
                            : run.status === "en-cours"
                              ? `prévu le ${day(m.scheduledAt)}`
                              : "non envoyé"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>

            {run.status === "en-cours" &&
              (stopping === run.id ? (
                <div className="seq-state__stop-form">
                  <label className="seq-state__stop-label">
                    Pourquoi l&apos;arrêter ?
                    <select value={reason} onChange={(e) => setReason(e.target.value)}>
                      {MANUAL_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    placeholder="Précision (facultatif) — ex. rappelle en janvier"
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="seq-state__stop-actions">
                    <button
                      type="button"
                      className="seq-state__stop-confirm"
                      disabled={sending}
                      onClick={() => void stop(run)}
                    >
                      {sending ? "Arrêt…" : "Arrêter la séquence"}
                    </button>
                    <button
                      type="button"
                      className="seq-state__stop-cancel"
                      disabled={sending}
                      onClick={() => setStopping(null)}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="seq-state__stop" onClick={() => setStopping(run.id)}>
                  Arrêter cette séquence…
                </button>
              ))}
          </div>
        );
      })}

      {preview ? (
        <EmailPreview url={preview.url} title={preview.title} onClose={() => setPreview(null)} />
      ) : null}
    </div>
  );
};

export default SequenceState;
