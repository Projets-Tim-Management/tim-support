"use client";

import { useConfig } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { StartTestModal } from "@/modules/marketing/admin/StartTestModal";
import { CLIENT_STATUSES } from "@/modules/partner/lib/clientStatus";
import { eur } from "@/modules/partner/lib/format";

/**
 * Vue Kanban des « Opportunités » : une colonne par statut, cartes
 * glissables (drag-and-drop natif) pour changer le statut d'un client.
 *
 * - Données récupérées via l'API REST (`?draft=true` pour voir l'état de travail),
 *   donc l'access control par rôle s'applique : un partenaire-métier ne voit que
 *   SES clients ; l'admin voit tout.
 * - Glisser une carte vers « Résilié » ou « Archivé » ouvre un modal demandant la
 *   date de fin de contrat (cohérent avec le flux d'archivage existant). Vers un
 *   statut « vivant », la date de fin est effacée.
 * - Le PATCH préserve l'état brouillon/publié (`?draft=true` si la fiche est un
 *   brouillon) pour ne pas publier par erreur une fiche incomplète.
 * - Un clic simple (sans glisser) ouvre la fiche du client.
 */

type PartnerRef = { societe?: string; name?: string; email?: string } | number | string | null | undefined;

type ClientDoc = {
  id: number | string;
  companyName?: string;
  clientStatus?: string;
  caPaye?: number;
  signatureDate?: string;
  resiliationDate?: string | null;
  updatedAt?: string;
  _status?: string;
  partner?: PartnerRef;
};

// Une colonne par statut, dans l'ordre du pipeline — définition partagée avec le
// champ, les onglets et la pastille de tableau (CLIENT_STATUSES).
const COLUMNS = CLIENT_STATUSES;

/** Statuts « fin de contrat » : exigent une date de fin (résilié / archivé). */
const isEnded = (status: string) => status === "resilie" || status === "archive";

const todayISO = () => new Date().toISOString().slice(0, 10);

const apporteurLabel = (p: PartnerRef): string | null => {
  if (!p || typeof p !== "object") return null;
  return p.societe || p.name || p.email || null;
};

const frDate = (d?: string | null) => {
  if (!d) return null;
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString("fr-FR");
};

/** « Dernière activité » relative à partir de updatedAt (comme un CRM). */
const relativeActivity = (d?: string): string => {
  if (!d) return "Aucune activité";
  const then = new Date(d).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} jours`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Il y a ${weeks} semaine${weeks > 1 ? "s" : ""}`;
  const months = Math.floor(days / 30);
  return `Il y a ${months} mois`;
};

/** Initiales (2 lettres max) pour l'avatar de la puce contact. */
const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
};

/** Petites icônes SVG des cartes (drapeau de statut / calendrier). */
const IconFlag = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M4 2v12M4 3h8l-1.5 2.5L12 8H4" />
  </svg>
);
const IconCalendar = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" strokeLinecap="round" />
  </svg>
);

export function PartnerClientsBoard() {
  const { config } = useConfig();
  const router = useRouter();
  const adminRoute = config.routes.admin;

  const [clients, setClients] = useState<ClientDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // Passage en résilié/archivé : en attente de la date de fin de contrat.
  const [pending, setPending] = useState<{ client: ClientDoc; status: string } | null>(null);
  const [pendingDate, setPendingDate] = useState<string>(todayISO());
  // Passage en « En test » : le modal de démarrage (date, contact, étapes).
  const [startingTest, setStartingTest] = useState<ClientDoc | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // `select` : sans lui chaque client arrive avec TOUS ses champs, dont
        // l'historique mensuel des montants — 41 Ko pour 12 clients, et une charge
        // qui grossit avec l'ancienneté. On ne lit que ce que les cartes affichent.
        // Mesuré : 298 ms / 41 Ko → 131 ms / 2 Ko.
        const fields = [
          "companyName",
          "clientStatus",
          "caPaye",
          "signatureDate",
          "resiliationDate",
          "updatedAt",
          "partner",
          "_status",
        ]
          .map((f) => `select[${f}]=true`)
          .join("&");
        const res = await fetch(
          `/payload-api/partner-clients?limit=1000&depth=1&draft=true&sort=statusRank&${fields}`,
          { credentials: "include" },
        );
        const data = res.ok ? await res.json() : { docs: [] };
        if (!cancelled) setClients((data?.docs ?? []) as ClientDoc[]);
      } catch {
        if (!cancelled) setError("Chargement des clients impossible.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byStatus = useMemo(() => {
    const map: Record<string, ClientDoc[]> = {};
    for (const col of COLUMNS) map[col.value] = [];
    for (const c of clients) (map[c.clientStatus ?? "prospect"] ??= []).push(c);
    return map;
  }, [clients]);

  /** Applique le changement de statut (optimiste + rollback en cas d'échec). */
  const applyMove = useCallback(
    async (client: ClientDoc, status: string, resiliationDate: string | null) => {
      const snapshot = clients;
      setClients((cs) =>
        cs.map((c) => (c.id === client.id ? { ...c, clientStatus: status, resiliationDate } : c)),
      );
      try {
        const isDraft = client._status === "draft";
        const url = `/payload-api/partner-clients/${client.id}${isDraft ? "?draft=true" : ""}`;
        const res = await fetch(url, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientStatus: status, resiliationDate }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setClients(snapshot); // rollback
        setError("Impossible de déplacer ce client. Réessayez.");
      }
    },
    [clients],
  );

  /** Résout un dépôt sur une colonne : ouvre le modal qu'il faut, s'il en faut un. */
  const dropTo = useCallback(
    (status: string, id: string) => {
      setOverCol(null);
      const client = clients.find((c) => String(c.id) === id);
      if (!client || (client.clientStatus ?? "prospect") === status) return;

      if (isEnded(status)) {
        setPendingDate(client.resiliationDate?.slice(0, 10) || todayISO());
        setPending({ client, status });
      } else if (status === "en-test") {
        // Passer « En test » n'est pas un simple changement de statut : c'est le
        // démarrage du parcours. Le modal collecte la date et le contact, et
        // montre les étapes que ça déclenche.
        setStartingTest(client);
      } else {
        // Retour à un statut vivant → la date de fin n'a plus lieu d'être.
        void applyMove(client, status, null);
      }
    },
    [clients, applyMove],
  );

  const confirmPending = useCallback(() => {
    if (!pending || !pendingDate) return;
    void applyMove(pending.client, pending.status, new Date(pendingDate).toISOString());
    setPending(null);
  }, [pending, pendingDate, applyMove]);

  const openClient = (id: number | string) =>
    router.push(`${adminRoute}/collections/partner-clients/${id}`);

  if (loading) return <p className="tim-kanban__msg">Chargement du tableau…</p>;

  return (
    <div className="tim-kanban-wrap">
      {error && (
        <p className="tim-kanban__error" role="alert" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      <div className="tim-kanban" role="list">
        {COLUMNS.map((col) => {
          const cards = byStatus[col.value] ?? [];
          return (
            <section
              key={col.value}
              className={`tim-kanban__col${overCol === col.value ? " tim-kanban__col--over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (overCol !== col.value) setOverCol(col.value);
              }}
              onDragLeave={(e) => {
                // Ne réinitialise que si on quitte réellement la colonne (pas un enfant).
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropTo(col.value, e.dataTransfer.getData("text/plain"));
              }}
            >
              <header className="tim-kanban__col-head">
                <div className="tim-kanban__col-titlebar">
                  <span className="tim-kanban__dot" style={{ background: col.color }} />
                  <span className="tim-kanban__col-title">{col.label}</span>
                  <span className="tim-kanban__count">{cards.length}</span>
                </div>
                <div className="tim-kanban__col-total">
                  <span>Montant total</span>
                  <span className="tim-kanban__col-total-val">
                    {eur.format(cards.reduce((s, c) => s + (c.caPaye ?? 0), 0))}
                  </span>
                </div>
              </header>

              <div className="tim-kanban__col-body">
                {cards.map((c) => {
                  const apporteur = apporteurLabel(c.partner);
                  const ended = isEnded(col.value);
                  const footDate = frDate(ended ? c.resiliationDate : c.signatureDate);
                  return (
                    <article
                      key={c.id}
                      className="tim-kanban__card"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(c.id))}
                      onClick={() => openClient(c.id)}
                      role="listitem"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openClient(c.id);
                      }}
                    >
                      <div className="tim-kanban__card-title">
                        {c.companyName || "Client sans nom"}
                        {c._status === "draft" && <span className="tim-kanban__draft">brouillon</span>}
                      </div>

                      {c.caPaye ? <div className="tim-kanban__amount">{eur.format(c.caPaye)}</div> : null}

                      {apporteur && (
                        <div className="tim-kanban__chip">
                          <span className="tim-kanban__avatar">{initials(apporteur)}</span>
                          <span className="tim-kanban__chip-name">{apporteur}</span>
                        </div>
                      )}

                      <div className="tim-kanban__activity">
                        Dernière activité : {relativeActivity(c.updatedAt)}
                      </div>

                      {footDate && (
                        <div className="tim-kanban__foot">
                          <span className="tim-kanban__foot-left">
                            <span className="tim-kanban__foot-ico">
                              {ended ? <IconFlag /> : <IconCalendar />}
                            </span>
                            {ended ? "Fin de contrat" : "Signature"}
                          </span>
                          <span className="tim-kanban__foot-date">{footDate}</span>
                        </div>
                      )}
                    </article>
                  );
                })}
                {cards.length === 0 && <p className="tim-kanban__empty">Aucun client</p>}
              </div>
            </section>
          );
        })}
      </div>

      {/* Modals rendus par PORTAIL sur <body> : à l'intérieur du tableau, leur
          z-index reste prisonnier du contexte d'empilement de la vue et ils
          passent sous la barre latérale et la barre du haut. */}
      {pending &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="tim-kanban__modal-overlay" onClick={() => setPending(null)}>
            <div className="tim-kanban__modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="tim-kanban__modal-title">
                Passer « {pending.client.companyName || "ce client"} » en «{" "}
                {COLUMNS.find((c) => c.value === pending.status)?.label}{" "}»
              </h3>
              <p className="tim-kanban__modal-text">
                Indiquez la date de fin de contrat — la commission du partenaire s&apos;arrête à
                cette date.
              </p>
              <label className="tim-kanban__modal-label">
                Date de fin de contrat
                <input
                  type="date"
                  value={pendingDate}
                  onChange={(e) => setPendingDate(e.target.value)}
                  className="tim-kanban__modal-input"
                />
              </label>
              <div className="tim-kanban__modal-actions">
                <button type="button" className="tim-kanban__btn" onClick={() => setPending(null)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="tim-kanban__btn tim-kanban__btn--primary"
                  disabled={!pendingDate}
                  onClick={confirmPending}
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {startingTest && (
        <StartTestModal
          client={{ id: startingTest.id, companyName: startingTest.companyName }}
          onCancel={() => setStartingTest(null)}
          onDone={() => {
            const client = startingTest;
            setStartingTest(null);
            void applyMove(client, "en-test", null);
          }}
        />
      )}
    </div>
  );
}
