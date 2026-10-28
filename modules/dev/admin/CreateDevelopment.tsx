"use client";

import { Drawer, toast, useDocumentInfo, useDrawerSlug, useField, useModal } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { idOf } from "@/core/lib/relations";
import { DEFAULT_DEV_PRIORITY, DEFAULT_DEV_TYPE, DEV_PRIORITIES, DEV_TYPES } from "@/modules/dev/lib/devMeta";
import { DEFAULT_STATUS_KEY, positionOf, type DevStatusDoc } from "@/modules/dev/lib/devStatus";
import { devPriorityFromTicket, devTypeFromTicket } from "@/modules/dev/lib/fromTicket";

/**
 * « Créer un développement » depuis la fiche qui l'a fait naître — une
 * opportunité (le client le demande) ou un ticket (la demande est arrivée au
 * support).
 *
 * Une demande se perd entre l'échange où elle est dite et le tableau des
 * développements : il faut ouvrir un autre écran, retrouver l'origine, tout
 * resaisir. Trois occasions d'abandonner.
 *
 * Le tiroir écrit le développement sans quitter la fiche — titre, description,
 * checklist — et RATTACHE l'origine d'office : le client comme demandeur, ou le
 * ticket comme demande à l'origine. C'est ce lien qui alimente ensuite le
 * compteur qui sert à arbitrer, et qui permet de répondre au client six mois
 * plus tard sans chercher.
 *
 * Depuis un ticket, le formulaire arrive pré-rempli (sujet, demande, nature,
 * urgence — voir lib/fromTicket). Pré-rempli et NON créé d'office : on relit
 * avant d'ouvrir un développement, et une demande d'assistance n'est pas
 * toujours un développement.
 *
 * Après la création, le tiroir se referme et la liste se relit : le geste est
 * fini. On reste sur la fiche d'origine — on est en train de dépouiller une
 * demande, pas de travailler sur le développement.
 */

type Origin = {
  /** Champ de rattachement sur le développement. */
  relation: "opportunities" | "tickets";
  /** Ce qu'on écrit dans le titre du tiroir. */
  drawerTitle: string;
  /** Valeurs reprises de la fiche d'origine, si elle en porte. */
  prefill?: {
    title?: string;
    description?: string;
    type?: string;
    priority?: string;
  };
};
/** Un développement proposé au rattachement (relations en ids, depth 0). */
type LinkCandidate = {
  id: number | string;
  number?: number | null;
  title: string;
  status?: number | string | null;
  opportunities?: (number | string | { id: number | string })[] | null;
  tickets?: (number | string | { id: number | string })[] | null;
};

const CreateDevelopment = ({ origin }: { origin: Origin }) => {
  const { id } = useDocumentInfo();
  const router = useRouter();
  const slug = useDrawerSlug(`dev-from-${origin.relation}`);
  const { closeModal, openModal } = useModal();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState(DEFAULT_DEV_TYPE);
  const [priority, setPriority] = useState(DEFAULT_DEV_PRIORITY);
  const [points, setPoints] = useState<{ title: string; description: string }[]>([]);
  const [newPoint, setNewPoint] = useState("");
  const [sending, setSending] = useState(false);
  /**
   * Les colonnes du tableau, pour choisir où le développement arrive (un besoin
   * déjà arbitré n'a pas à repasser par la qualification). Vide si on n'a pas
   * le droit de les lire : le serveur pose alors la colonne d'entrée.
   */
  const [statuses, setStatuses] = useState<(DevStatusDoc & { id: number | string; name?: string })[]>([]);
  /** L'id tel que la base le rend : en texte, Payload refuse le statut. */
  const [status, setStatus] = useState<number | string | null>(null);

  /**
   * « Rattacher à un existant » : le même besoin, déjà ouvert pour un autre
   * client ou un autre ticket. On ajoute cette fiche à ses demandeurs plutôt
   * que d'ouvrir un doublon — c'est le compteur de demandes qui sert à arbitrer.
   */
  const [mode, setMode] = useState<"new" | "link">("new");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<LinkCandidate[] | null>(null);
  const [linking, setLinking] = useState<number | string | null>(null);

  useEffect(() => {
    if (mode !== "link") return;
    const q = query.trim().replace(/^#/, "");
    const params = new URLSearchParams({
      limit: "12",
      depth: "0",
      sort: "-updatedAt",
    });
    if (q) {
      params.set("where[or][0][title][like]", q);
      if (/^\d+$/.test(q)) params.set("where[or][1][number][equals]", q);
    }
    const ctrl = new AbortController();
    const t = setTimeout(
      () => {
        fetch(`/payload-api/developments?${params}`, {
          credentials: "include",
          signal: ctrl.signal,
        })
          .then((r) => (r.ok ? r.json() : { docs: [] }))
          .then((res: { docs?: LinkCandidate[] }) => setFound(res.docs ?? []))
          .catch(() => {});
      },
      q ? 250 : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [mode, query]);

  /** Ajoute un point à la checklist en construction. */
  const addPoint = () => {
    const clean = newPoint.trim();
    if (!clean) return;
    setPoints((list) => [...list, { description: "", title: clean }]);
    setNewPoint("");
  };

  const statusName = (v: LinkCandidate["status"]) =>
    v == null ? null : (statuses.find((st) => String(st.id) === String(v))?.name ?? null);

  const isLinked = (d: LinkCandidate) =>
    (d[origin.relation] ?? []).some((x) => String(idOf(x)) === String(id));

  /** Ajoute cette fiche aux demandeurs (ou tickets) d'un développement existant, sans retirer les autres. */
  const link = async (d: LinkCandidate) => {
    setLinking(d.id);
    try {
      // Relu juste avant d'écrire : la liste affichée peut dater de quelques secondes.
      const cur = await fetch(`/payload-api/developments/${d.id}?depth=0`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : null));
      const ids = ((cur?.[origin.relation] ?? []) as unknown[]).map(idOf).filter((x): x is number | string => x != null);
      if (!ids.some((x) => String(x) === String(id))) ids.push(id as number | string);
      const res = await fetch(`/payload-api/developments/${d.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [origin.relation]: ids }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.errors?.[0]?.message ?? `Rattachement impossible (erreur ${res.status}).`);
        return;
      }
      toast.success(`Rattaché au développement${d.number ? ` #${d.number}` : ""} « ${d.title} ».`);
      setQuery("");
      setFound(null);
      setMode("new");
      closeModal(slug);
      router.refresh();
    } catch {
      toast.error("Rattachement impossible : le serveur n'a pas répondu.");
    } finally {
      setLinking(null);
    }
  };

  // Fiche pas encore enregistrée : il n'y a rien à quoi rattacher.
  if (id == null) return null;

  /** Ouvre le tiroir en reprenant ce que la fiche d'origine sait déjà. */
  const open = () => {
    const pre = origin.prefill;
    if (pre) {
      if (title.trim() === "" && pre.title) setTitle(pre.title);
      if (description.trim() === "" && pre.description) setDescription(pre.description);
      if (pre.type) setType(pre.type);
      if (pre.priority) setPriority(pre.priority);
    }
    openModal(slug);
    if (!statuses.length) {
      void fetch("/payload-api/dev-statuses?limit=100&depth=0&sort=position", {
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : { docs: [] }))
        .then((res: { docs?: (DevStatusDoc & { id: number | string; name?: string })[] }) => {
          const list = (res.docs ?? []).slice().sort((a, b) => (positionOf(a) ?? 0) - (positionOf(b) ?? 0));
          setStatuses(list);
          // La colonne d'entrée par défaut, comme le serveur (à défaut, la première).
          const entry = list.find((x) => x.key === DEFAULT_STATUS_KEY) ?? list[0];
          if (entry && status == null) setStatus(entry.id);
        })
        .catch(() => {});
    }
  };

  const create = async () => {
    const clean = title.trim();
    if (!clean) return;
    setSending(true);
    try {
      const res = await fetch("/payload-api/developments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: clean,
          description: description.trim() || undefined,
          type,
          priority,
          ...(status != null ? { status } : {}),
          // Les points saisis ici : un besoin de prospect arrive rarement seul,
          // et les découper au moment où on les lit évite d'y revenir.
          checklist: points
            .filter((p) => p.title.trim() !== "")
            .map((p) => ({
              title: p.title.trim(),
              description: p.description.trim() || undefined,
            })),
          // Le rattachement, qui est toute la raison d'être de ce bouton.
          [origin.relation]: [id],
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(body?.errors?.[0]?.message ?? `Création impossible (erreur ${res.status}).`);
        return;
      }
      const number = body?.doc?.number;
      toast.success(
        `Développement${number ? ` #${number}` : ""} créé et rattaché à ${
          origin.relation === "tickets" ? "ce ticket" : "ce client"
        }.`,
      );
      setTitle("");
      setDescription("");
      setPoints([]);
      setNewPoint("");
      setType(DEFAULT_DEV_TYPE);
      setPriority(DEFAULT_DEV_PRIORITY);
      // Le geste est fini : on referme et on rend la fiche. Laisser le tiroir
      // ouvert « pour en saisir un autre » obligeait à le fermer à la main
      // dans le cas courant, où l'on n'en saisit qu'un.
      closeModal(slug);
      // La liste des besoins est rendue par le serveur : on la relit.
      router.refresh();
    } catch {
      toast.error("Création impossible : le serveur n'a pas répondu.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="field-type dev-need">
      <button type="button" className="dev-need__open" onClick={open}>
        + Créer un développement
      </button>

      {/* `className` : le tiroir de Payload occupe presque tout l'écran, ce qui
          est juste pour une fiche entière, pas pour un formulaire de six champs.
          On le resserre en CSS (voir dev.scss). */}
      <Drawer className="dev-need-drawer" slug={slug} title={origin.drawerTitle}>
        <div className="dev-need__panel">
          <div className="dev-need__modes" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "new"}
              className={mode === "new" ? "is-active" : ""}
              onClick={() => setMode("new")}
            >
              Nouveau développement
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "link"}
              className={mode === "link" ? "is-active" : ""}
              onClick={() => setMode("link")}
            >
              Rattacher à un existant
            </button>
          </div>

          {mode === "link" ? (
            <section className="dev-need__form">
              <label className="dev-need__label">
                Rechercher un développement
                <input
                  type="text"
                  autoFocus
                  value={query}
                  placeholder="Titre ou numéro — ex. alerte pointage, ou #42"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {found === null ? (
                <p className="dev-disc__hint">Chargement…</p>
              ) : found.length === 0 ? (
                <p className="dev-disc__hint">Aucun développement ne correspond.</p>
              ) : (
                <ul className="dev-need__found">
                  {found.map((d) => {
                    const already = isLinked(d);
                    return (
                      <li key={d.id} className="dev-need__found-item">
                        <span className="dev-need__found-text">
                          <strong>
                            {d.number ? `#${d.number} ` : ""}
                            {d.title}
                          </strong>
                          {/* Le nom de la colonne, lu dans la liste déjà chargée pour le choix de colonne. */}
                          {statusName(d.status) && <span className="dev-need__found-status">{statusName(d.status)}</span>}
                        </span>
                        {already ? (
                          <span className="dev-need__found-done">Déjà rattaché</span>
                        ) : (
                          <button
                            type="button"
                            className="dev-need__found-btn"
                            disabled={linking != null}
                            onClick={() => void link(d)}
                          >
                            {linking === d.id ? "…" : "Rattacher"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="dev-disc__hint">
                {origin.relation === "tickets"
                  ? "Ce ticket rejoint les demandes à l'origine du développement choisi."
                  : "Ce client rejoint les demandeurs du développement choisi : son compteur de demandes augmente."}
              </p>
            </section>
          ) : (
            <section className="dev-need__form">
              <label className="dev-need__label">
                Titre
                <input
                  type="text"
                  value={title}
                  placeholder="Le besoin en une ligne — ex. Export comptable au format Sage"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label className="dev-need__label">
                Description
                <textarea
                  value={description}
                  rows={5}
                  placeholder="Ce que le client demande, dans ses mots si possible."
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              {/* La checklist, dès la création : ce qu'il faudra faire se dit
                mieux au moment où on lit la demande qu'une semaine plus tard. */}
              <div className="dev-need__label">
                Checklist (facultatif)
                {points.length > 0 ? (
                  <ul className="dev-need__points">
                    {points.map((point, i) => (
                      <li key={`${i}-${point.title}`} className="dev-need__point">
                        <div className="dev-need__point-head">
                          <span className="dev-need__point-num">{i + 1}</span>
                          <span className="dev-need__point-title">{point.title}</span>
                          <button
                            type="button"
                            className="dev-msg__del"
                            aria-label="Retirer ce point"
                            title="Retirer ce point"
                            onClick={() => setPoints((list) => list.filter((_, j) => j !== i))}
                          >
                            ×
                          </button>
                        </div>
                        <textarea
                          className="dev-need__point-desc"
                          value={point.description}
                          rows={1}
                          placeholder="Description (facultatif)"
                          onChange={(e) =>
                            setPoints((list) =>
                              list.map((p, j) => (j === i ? { ...p, description: e.target.value } : p)),
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="dev-need__point-add">
                  <input
                    type="text"
                    value={newPoint}
                    placeholder="Ajouter un point — ex. Gérer les congés à cheval sur deux mois"
                    onChange={(e) => setNewPoint(e.target.value)}
                    // Entrée ajoute : on en saisit plusieurs d'affilée, la souris
                    // n'a pas à faire l'aller-retour vers le bouton.
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addPoint();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="dev-need__point-btn"
                    disabled={newPoint.trim() === ""}
                    onClick={addPoint}
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              <div className="dev-need__row">
                <label className="dev-need__label">
                  Type
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    {DEV_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                {statuses.length > 0 && (
                  <label className="dev-need__label dev-need__label--wide">
                    Colonne du tableau
                    <select
                      value={String(status ?? "")}
                      onChange={(e) => setStatus(statuses.find((st) => String(st.id) === e.target.value)?.id ?? null)}
                    >
                      {statuses.map((st) => (
                        <option key={st.id} value={String(st.id)}>
                          {st.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="dev-need__label">
                  Priorité
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    {DEV_PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="dev-need__actions">
                <button
                  type="button"
                  className="dev-disc__send"
                  disabled={sending || title.trim() === ""}
                  onClick={create}
                >
                  {sending ? "Création…" : "Créer et rattacher"}
                </button>
                <button type="button" className="dev-need__close" onClick={() => closeModal(slug)}>
                  Fermer
                </button>
              </div>
              <p className="dev-disc__hint">
                Le développement est créé immédiatement, dans la colonne choisie, rattaché à cette fiche.
              </p>
            </section>
          )}
        </div>
      </Drawer>
    </div>
  );
};

/**
 * Depuis une OPPORTUNITÉ : le client devient demandeur du développement.
 */
export const NeedFromOpportunity = () => {
  const { value: company } = useField<string>({ path: "companyName" });
  return (
    <CreateDevelopment
      origin={{
        drawerTitle: company ? `Besoin de ${company}` : "Nouveau développement",
        relation: "opportunities",
      }}
    />
  );
};

/**
 * Depuis un TICKET : le ticket reste attaché au développement, et le formulaire
 * arrive rempli de ce que le ticket dit déjà. On relit avant de créer — une
 * demande d'assistance n'est pas toujours un développement.
 */
export const NeedFromTicket = () => {
  const { value: subject } = useField<string>({ path: "subject" });
  const { value: description } = useField<string>({ path: "description" });
  const { value: ticketType } = useField<string>({ path: "type" });
  const { value: ticketPriority } = useField<string>({ path: "priority" });

  return (
    <CreateDevelopment
      origin={{
        drawerTitle: "Développement issu de ce ticket",
        prefill: {
          description: description ?? "",
          priority: devPriorityFromTicket(ticketPriority),
          title: subject ?? "",
          type: devTypeFromTicket(ticketType),
        },
        relation: "tickets",
      }}
    />
  );
};
