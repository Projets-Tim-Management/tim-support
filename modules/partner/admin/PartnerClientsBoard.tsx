"use client";

import { useConfig } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { StartTestModal } from "@/modules/marketing/admin/StartTestModal";
import { ActivityIcon } from "@/modules/partner/admin/ActivityIcons";
import { taskKindLabel } from "@/modules/partner/lib/activity";
import {
  CLIENT_STATUSES,
  DEFAULT_CLIENT_STATUS,
  needsEndDate,
} from "@/modules/partner/lib/clientStatus";
import { eur } from "@/modules/partner/lib/format";

/**
 * Vue Kanban des « Opportunités » : une colonne par statut, cartes
 * glissables (drag-and-drop natif) pour changer le statut d'un client.
 *
 * - Données récupérées via l'API REST (`?draft=true` pour voir l'état de travail),
 *   donc l'access control par rôle s'applique : un partenaire-métier ne voit que
 *   SES clients ; l'admin voit tout.
 * - Glisser une carte vers « Résilié » ou « Archivé » ouvre un modal demandant la
 *   date de fin de contrat (cohérent avec le flux d'archivage existant) ; vers
 *   « Gagnée », un modal demande la date de DÉBUT de contrat, celle qui
 *   enclenche l'abonnement mensuel. Vers un statut « vivant », la date de fin
 *   est effacée.
 * - Le PATCH préserve l'état brouillon/publié (`?draft=true` si la fiche est un
 *   brouillon) pour ne pas publier par erreur une fiche incomplète.
 * - Un clic simple (sans glisser) ouvre la fiche du client.
 */

type PartnerRef = { societe?: string; name?: string; email?: string } | number | string | null | undefined;

type ClientDoc = {
  id: number | string;
  companyName?: string;
  raisonSociale?: string;
  email?: string;
  clientStatus?: string;
  caPaye?: number;
  signatureDate?: string;
  contractStartDate?: string | null;
  resiliationDate?: string | null;
  updatedAt?: string;
  _status?: string;
  partner?: PartnerRef;
};

// Une colonne par statut, dans l'ordre du pipeline — définition partagée avec le
// champ, les onglets et la pastille de tableau (CLIENT_STATUSES).
const COLUMNS = CLIENT_STATUSES;

/**
 * Ce que le dépôt sur une colonne doit demander avant d'être appliqué :
 * `fin` = date de fin de contrat (résilié / archivé), `contrat` = date de début
 * (« Gagnée »). Les deux passent par le même modal, avec le bon libellé.
 */
type AskKind = "fin" | "contrat";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Minuscules sans accents : « Rénové » et « renove » doivent se rencontrer. */
const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Tâche ouverte d'un client, telle qu'elle s'affiche sur sa carte. */
type OpenTask = {
  id: number | string;
  title?: string | null;
  taskKind?: string | null;
  dueDate?: string | null;
  highPriority?: boolean;
  client?: number | string | { id?: number | string } | null;
};

/**
 * Échéance en clair : « en retard », « aujourd'hui », « demain », « dans 5 j ».
 *
 * Le Kanban se balaie, il ne se lit pas : une date au format « 28/09 » oblige à
 * calculer, ces mots-là non.
 */
const dueLabel = (iso?: string | null): { text: string; late: boolean } | null => {
  if (!iso) return null;
  const day = (d: Date) => d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const today = day(new Date());
  const key = day(target);
  if (key < today) return { text: "en retard", late: true };
  if (key === today) return { text: "aujourd'hui", late: false };
  const days = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 1) return { text: "demain", late: false };
  if (days < 7) return { text: `dans ${days} j`, late: false };
  if (days < 31) return { text: `dans ${Math.round(days / 7)} sem.`, late: false };
  return { text: target.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }), late: false };
};

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
  // Passage en résilié/archivé (date de fin) ou en « Gagnée » (date de début).
  const [pending, setPending] = useState<{ client: ClientDoc; status: string; kind: AskKind } | null>(
    null,
  );
  const [pendingDate, setPendingDate] = useState<string>(todayISO());
  // Passage en « En test » : le modal de démarrage (date, contact, étapes).
  const [startingTest, setStartingTest] = useState<ClientDoc | null>(null);
  /**
   * Tâches ouvertes, indexées par client.
   *
   * UNE requête pour tout le tableau, et non une par carte : à trente clients,
   * trente requêtes rendraient le Kanban plus lent que la fiche qu'il évite
   * d'ouvrir.
   */
  const [tasksByClient, setTasksByClient] = useState<Record<string, OpenTask[]>>({});
  /**
   * Contacts par client, pour chercher « Nathanaele » ou « Coutansais ».
   *
   * On cherche presque toujours quelqu'un, pas une raison sociale — et le nom
   * de la personne ne figure nulle part sur la fiche client elle-même.
   */
  const [contactsByClient, setContactsByClient] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

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
          // Raison sociale : on cherche souvent une entreprise par son nom
          // officiel (« SAS Dupont ») quand la fiche porte son nom d'usage.
          "raisonSociale",
          // Pré-remplit le modal de démarrage : l'adresse est déjà sur la fiche,
          // la faire retaper depuis le Kanban n'apporte rien qu'une faute de frappe.
          "email",
          "clientStatus",
          "caPaye",
          "signatureDate",
          // Affichée au pied des cartes « Gagnée », et pré-remplit le modal quand
          // on y redépose une carte.
          "contractStartDate",
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

  // Ce qui reste à faire, tous clients confondus. Chargé en parallèle des
  // cartes : le tableau s'affiche sans attendre les échéances.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs =
          "?where[type][equals]=tache&where[done][not_equals]=true&where[dueDate][exists]=true" +
          "&sort=dueDate&limit=500&depth=0" +
          "&select[client]=true&select[title]=true&select[taskKind]=true" +
          "&select[dueDate]=true&select[highPriority]=true";
        const res = await fetch(`/payload-api/client-activities${qs}`, { credentials: "include" });
        const json = res.ok ? await res.json() : { docs: [] };
        if (cancelled) return;
        const map: Record<string, OpenTask[]> = {};
        for (const t of (json?.docs ?? []) as OpenTask[]) {
          const ref = t.client;
          const cid = ref && typeof ref === "object" ? ref.id : ref;
          if (cid == null) continue;
          (map[String(cid)] ??= []).push(t);
        }
        setTasksByClient(map);
      } catch {
        // Sans échéances, le Kanban reste utilisable : elles sont un plus.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Les contacts, en UNE requête pour tout le tableau (même raison que les
  // tâches : une requête par carte rendrait le Kanban plus lent que la fiche).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "/payload-api/client-contacts?limit=2000&depth=0" +
            "&select[client]=true&select[firstName]=true&select[lastName]=true&select[email]=true",
          { credentials: "include" },
        );
        const json = res.ok ? await res.json() : { docs: [] };
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const c of (json?.docs ?? []) as {
          client?: number | string | { id?: number | string };
          firstName?: string;
          lastName?: string;
          email?: string;
        }[]) {
          const ref = c.client;
          const cid = ref && typeof ref === "object" ? ref.id : ref;
          if (cid == null) continue;
          map[String(cid)] =
            `${map[String(cid)] ?? ""} ${c.firstName ?? ""} ${c.lastName ?? ""} ${c.email ?? ""}`;
        }
        setContactsByClient(map);
      } catch {
        // Sans contacts, la recherche porte sur la société et l'adresse.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Filtre de recherche : société, raison sociale, adresse e-mail, nom et
   * prénom des contacts.
   *
   * Chaque MOT doit être trouvé, dans n'importe quel champ et n'importe quel
   * ordre : « dupont paris » retrouve la fiche que « paris dupont » aurait
   * manquée avec une simple sous-chaîne. Accents ignorés — on tape rarement
   * « Coutansais » avec la bonne cédille dans une barre de recherche.
   */
  const filtered = useMemo(() => {
    const terms = normalize(search).split(" ").filter(Boolean);
    if (!terms.length) return clients;
    return clients.filter((c) => {
      const hay = normalize(
        [c.companyName, c.raisonSociale, c.email, contactsByClient[String(c.id)]]
          .filter(Boolean)
          .join(" "),
      );
      return terms.every((t) => hay.includes(t));
    });
  }, [clients, contactsByClient, search]);

  const byStatus = useMemo(() => {
    const map: Record<string, ClientDoc[]> = {};
    for (const col of COLUMNS) map[col.value] = [];
    for (const c of filtered) (map[c.clientStatus ?? DEFAULT_CLIENT_STATUS] ??= []).push(c);
    return map;
  }, [filtered]);

  /** Applique le changement de statut (optimiste + rollback en cas d'échec). */
  const applyMove = useCallback(
    async (client: ClientDoc, status: string, patch: Partial<ClientDoc> = {}) => {
      const snapshot = clients;
      const body = { clientStatus: status, ...patch };
      setClients((cs) => cs.map((c) => (c.id === client.id ? { ...c, ...body } : c)));
      try {
        const isDraft = client._status === "draft";
        const url = `/payload-api/partner-clients/${client.id}${isDraft ? "?draft=true" : ""}`;
        const res = await fetch(url, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        // Le serveur refuse certaines bascules (phase de test sans calendrier,
        // « Gagnée » sans date de contrat) : on relaie SON message plutôt qu'un
        // « impossible » générique, sinon la règle reste invisible.
        if (!res.ok) {
          const detail = await res
            .json()
            .then((j) => j?.errors?.[0]?.message as string | undefined)
            .catch(() => undefined);
          throw new Error(detail);
        }
      } catch (e) {
        setClients(snapshot); // rollback
        setError((e as Error)?.message || "Impossible de déplacer ce client. Réessayez.");
      }
    },
    [clients],
  );

  /** Résout un dépôt sur une colonne : ouvre le modal qu'il faut, s'il en faut un. */
  const dropTo = useCallback(
    (status: string, id: string) => {
      setOverCol(null);
      const client = clients.find((c) => String(c.id) === id);
      if (!client || (client.clientStatus ?? DEFAULT_CLIENT_STATUS) === status) return;

      if (needsEndDate(status)) {
        setPendingDate(client.resiliationDate?.slice(0, 10) || todayISO());
        setPending({ client, status, kind: "fin" });
      } else if (status === "en-test") {
        // Passer « En test » n'est pas un simple changement de statut : c'est le
        // démarrage du parcours. Le modal collecte la date et le contact, et
        // montre les étapes que ça déclenche.
        setStartingTest(client);
      } else if (status === "actif") {
        // « Gagnée » déclenche l'abonnement mensuel : on demande la date de
        // début de contrat AU MOMENT du geste. Sans elle, le serveur refuse la
        // bascule (requireContractStart) — autant la collecter ici.
        setPendingDate(client.contractStartDate?.slice(0, 10) || todayISO());
        setPending({ client, status, kind: "contrat" });
      } else {
        // Retour à un statut vivant → la date de fin n'a plus lieu d'être.
        void applyMove(client, status, { resiliationDate: null });
      }
    },
    [clients, applyMove],
  );

  const confirmPending = useCallback(() => {
    if (!pending || !pendingDate) return;
    const iso = new Date(pendingDate).toISOString();
    void applyMove(
      pending.client,
      pending.status,
      pending.kind === "contrat"
        ? // Un contrat qui (re)commence efface la date de fin : les deux ne
          // peuvent pas être vraies en même temps.
          { contractStartDate: iso, resiliationDate: null }
        : { resiliationDate: iso },
    );
    setPending(null);
  }, [pending, pendingDate, applyMove]);

  const openClient = (id: number | string) =>
    router.push(`${adminRoute}/collections/partner-clients/${id}`);

  if (loading) return <p className="tim-kanban__msg">Chargement du tableau…</p>;

  return (
    <div className="tim-kanban-wrap">
      {/* Recherche : société, raison sociale, e-mail, nom et prénom des contacts.
          Le filtre est LOCAL — les fiches sont déjà chargées, une requête par
          frappe n'apporterait qu'une latence. */}
      <div className="tim-kanban__search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          className="tim-kanban__search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une société, un e-mail, un nom…"
          aria-label="Rechercher une opportunité"
        />
        {search && (
          <>
            <span className="tim-kanban__search-count">
              {filtered.length} / {clients.length}
            </span>
            <button
              type="button"
              className="tim-kanban__search-clear"
              onClick={() => setSearch("")}
              aria-label="Effacer la recherche"
            >
              ✕
            </button>
          </>
        )}
      </div>

      {/* Une recherche sans résultat le DIT : sinon on lit dix colonnes vides en
          se demandant si les fiches ont disparu. */}
      {search && filtered.length === 0 && (
        <p className="tim-kanban__msg">
          Aucune opportunité ne correspond à « {search} ».
        </p>
      )}

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
                  const ended = needsEndDate(col.value);
                  const won = col.value === "actif";
                  const footDate = frDate(
                    ended ? c.resiliationDate : won ? c.contractStartDate : c.signatureDate,
                  );
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

                      {/* Ce qui est PRÉVU sur ce client. Le Kanban dit déjà où en
                          est chaque affaire ; il manquait ce qu'il reste à faire —
                          la seule information qui décide de la journée. Deux
                          échéances au plus : au-delà, la carte devient une liste
                          et la colonne n'est plus lisible. */}
                      {(tasksByClient[String(c.id)]?.length ?? 0) > 0 && (
                        <ul className="tim-kanban__tasks">
                          {tasksByClient[String(c.id)].slice(0, 2).map((t) => {
                            const due = dueLabel(t.dueDate);
                            return (
                              <li key={t.id} className="tim-kanban__task">
                                <span className="tim-kanban__task-ico">
                                  <ActivityIcon kind={t.taskKind ?? "tache"} />
                                </span>
                                <span className="tim-kanban__task-title">
                                  {t.highPriority && <span className="tim-kanban__task-flag">⚑</span>}
                                  {t.title || taskKindLabel(t.taskKind) || "Tâche"}
                                </span>
                                {due && (
                                  <span
                                    className={`tim-kanban__task-due${due.late ? " is-late" : ""}`}
                                  >
                                    {due.text}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                          {tasksByClient[String(c.id)].length > 2 && (
                            <li className="tim-kanban__task tim-kanban__task--more">
                              +{tasksByClient[String(c.id)].length - 2} autre
                              {tasksByClient[String(c.id)].length - 2 > 1 ? "s" : ""}
                            </li>
                          )}
                        </ul>
                      )}

                      {footDate && (
                        <div className="tim-kanban__foot">
                          <span className="tim-kanban__foot-left">
                            <span className="tim-kanban__foot-ico">
                              {ended ? <IconFlag /> : <IconCalendar />}
                            </span>
                            {ended ? "Fin de contrat" : won ? "Début de contrat" : "Signature"}
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
                {pending.kind === "contrat"
                  ? "Indiquez la date de début de contrat — le calcul des licences mensuelles (CA et commission) démarre à cette date."
                  : "Indiquez la date de fin de contrat — la commission du partenaire s'arrête à cette date."}
              </p>
              <label className="tim-kanban__modal-label">
                {pending.kind === "contrat" ? "Date de début de contrat" : "Date de fin de contrat"}
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
          defaultEmail={startingTest.email}
          onCancel={() => setStartingTest(null)}
          onDone={() => {
            const client = startingTest;
            setStartingTest(null);
            void applyMove(client, "en-test", { resiliationDate: null });
          }}
        />
      )}
    </div>
  );
}
