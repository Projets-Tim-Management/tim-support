"use client";

import { useDocumentInfo } from "@payloadcms/ui";
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
 * En lecture seule pour le reste, et volontairement : arrêter une séquence est
 * un geste qui appartient à l'écran de la séquence, avec son motif d'arrêt. Un
 * bouton ici inviterait à couper sans dire pourquoi.
 */

type Message = { key?: string; scheduledAt?: string; sentAt?: string | null; skipped?: string | null };

type Run = {
  id: number | string;
  sequence?: string;
  sequenceLabel?: string;
  status?: string;
  stopReason?: string;
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

const SKIPPED: Record<string, string> = {
  desinscrit: "non envoyé — désinscrit",
  echec: "non envoyé — échec",
};

const day = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "";

export const SequenceState: React.FC = () => {
  const { id } = useDocumentInfo();
  const [runs, setRuns] = useState<Run[] | null>(null);
  /** Titres des messages, par clé de séquence : la ligne n'en porte que la clé. */
  const [titles, setTitles] = useState<Record<string, string>>({});
  /** Message dont le rendu est ouvert (null = aucun). */
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

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
        const status = STATUS[run.status ?? ""] ?? { label: run.status ?? "—", tone: "stop" };
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
