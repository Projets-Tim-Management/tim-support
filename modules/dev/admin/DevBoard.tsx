"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { initialsOf } from "@/modules/dev/admin/team";
import { devMeta, paletteColor } from "@/modules/dev/lib/devMeta";
import { platformKind } from "@/modules/dev/lib/platforms";
import { DEV_PHASES, type DevStatusDoc } from "@/modules/dev/lib/devStatus";

/**
 * Vue Kanban des développements : une colonne par statut, les colonnes
 * regroupées sous leur PHASE, cartes glissables pour faire avancer une demande.
 *
 * C'est le regroupement par phase qui rend une vingtaine de colonnes tenables :
 * de loin on lit cinq blocs (« il y a du monde en Étude et rien en Livraison »),
 * de près on travaille au statut. Sans lui, il aurait fallu choisir entre un
 * tableau illisible et des statuts trop grossiers pour dire où on en est.
 *
 * Les colonnes viennent de la base (collection `dev-statuses`) et non du code :
 * ce qui est réglé dans « Paramètres › Statuts » se voit ici au rechargement.
 *
 * Les données passent par l'API REST : l'access control s'applique donc
 * normalement (module réservé à l'admin).
 */

type Ref = { id?: number | string; name?: string; pathTitle?: string; color?: string } | number | string | null;

type DevDoc = {
  id: number | string;
  number?: number;
  title?: string;
  type?: string;
  priority?: string;
  dueDate?: string | null;
  demandCount?: number;
  checklistProgress?: string | null;
  /** Ordre d'importance dans la colonne (1 = en haut). */
  rank?: number | null;
  status?: { id?: number | string; name?: string; color?: string } | number | string | null;
  /** Peuplés à depth=1 : des personnes, pas des identifiants. Multiple depuis 09/2026. */
  assignee?: Ref[] | Ref;
  /** Les clients qui attendent ce développement, peuplés eux aussi. */
  opportunities?: Ref[] | Ref;
  /** Web, Mobile, ou les deux. */
  platforms?: Ref[] | Ref;
};

const nameOf = (ref: unknown): string => {
  if (!ref || typeof ref !== "object") return "";
  const r = ref as { pathTitle?: string; name?: string; firstName?: string; lastName?: string; email?: string };
  // `||` et non `??` : une chaîne VIDE doit passer au repli suivant, ce que
  // `??` (qui ne réagit qu'à null/undefined) ne ferait pas.
  return (
    r.pathTitle ||
    r.name ||
    [r.firstName, r.lastName].filter(Boolean).join(" ").trim() ||
    r.email ||
    ""
  );
};

/** Raison sociale d'une opportunité, quelle que soit la clé qui la porte. */
const companyOf = (ref: unknown): string => {
  if (!ref || typeof ref !== "object") return "";
  const r = ref as { companyName?: string; raisonSociale?: string; name?: string };
  return (r.companyName || r.raisonSociale || r.name || "").trim();
};

const dayMonth = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

/** « 4/7 » → 57. Renvoie 0 sur une valeur inattendue plutôt que de casser la carte. */
const progressPct = (raw?: string | null): number => {
  const m = /^(\d+)\/(\d+)$/.exec(raw ?? "");
  if (!m) return 0;
  const total = Number(m[2]);
  return total > 0 ? Math.round((Number(m[1]) / total) * 100) : 0;
};

/** Une échéance passée sur un dev non livré doit se voir : c'est une promesse tenue ou non. */
const isLate = (iso: string | null | undefined): boolean =>
  Boolean(iso) && new Date(iso as string).getTime() < Date.now();

/** Id d'une relation, qu'elle arrive peuplée ou réduite à son identifiant. */
const refId = (ref: unknown): string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") {
    const id = (ref as { id?: number | string }).id;
    return id == null ? null : String(id);
  }
  return String(ref);
};

export function DevBoard() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<DevStatusDoc[] | null>(null);
  const [docs, setDocs] = useState<DevDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<number | string | null>(null);
  /**
   * Où la carte tomberait si on lâchait maintenant : la colonne ET le rang
   * dans cette colonne. Sans l'index, on ne pourrait que changer de colonne —
   * or l'ordre à l'intérieur d'une colonne est précisément l'arbitrage qu'on
   * vient poser.
   */
  const [over, setOver] = useState<{ status: string; index: number } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Les colonnes ET les cartes : un board sans ses colonnes n'a rien à
        // montrer, les deux requêtes partent donc ensemble.
        const [resStatuses, resDocs] = await Promise.all([
          fetch("/payload-api/dev-statuses?limit=200&sort=position&depth=0", { credentials: "include" }),
          fetch("/payload-api/developments?limit=300&depth=1&sort=rank", { credentials: "include" }),
        ]);
        if (!resStatuses.ok || !resDocs.ok) throw new Error("chargement");
        const [dataStatuses, dataDocs] = await Promise.all([resStatuses.json(), resDocs.json()]);
        if (!active) return;
        setStatuses(Array.isArray(dataStatuses?.docs) ? dataStatuses.docs : []);
        // `rank` est stocké en `numeric` : selon la couche de lecture il revient
        // en nombre ou en chaîne. On normalise ICI, une fois, plutôt que de
        // s'en méfier partout — une comparaison « "2" !== 2 » ferait réécrire
        // toute la colonne à chaque déplacement.
        setDocs(
          (Array.isArray(dataDocs?.docs) ? (dataDocs.docs as DevDoc[]) : []).map((doc) => ({
            ...doc,
            rank: doc.rank == null || Number.isNaN(Number(doc.rank)) ? null : Number(doc.rank),
          })),
        );
      } catch {
        if (active) setError("Chargement impossible. Cliquez pour réessayer.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /**
   * Cartes par statut. Une carte dont le statut n'existe plus (colonne
   * supprimée en Paramètres) atterrit dans la PREMIÈRE colonne plutôt que de
   * disparaître : un développement invisible est pire qu'un développement mal
   * rangé.
   */
  const byStatus = useMemo(() => {
    const map: Record<string, DevDoc[]> = {};
    for (const s of statuses ?? []) map[String(s.id)] = [];
    const fallback = statuses?.[0] ? String(statuses[0].id) : null;
    for (const doc of docs ?? []) {
      const key = refId(doc.status);
      const bucket = key && map[key] ? key : fallback;
      if (bucket) map[bucket].push(doc);
    }
    // Le plus important en haut. Une carte sans rang passe en dernier plutôt
    // que devant : ne pas avoir été classée n'est pas une priorité.
    const LAST = Number.MAX_SAFE_INTEGER;
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.rank ?? LAST) - (b.rank ?? LAST));
    }
    return map;
  }, [docs, statuses]);

  /**
   * Les bandeaux du tableau : les cinq phases, dans leur ordre, chacune avec
   * ses colonnes. Une phase sans colonne n'est pas affichée — un bandeau vide
   * n'apprend rien.
   *
   * Le dernier groupe rattrape les statuts dont la phase serait inconnue
   * (valeur saisie hors des cinq prévues) : ils resteraient sinon hors du
   * tableau, avec leurs développements.
   */
  const groups = useMemo(() => {
    const list = statuses ?? [];
    const known = DEV_PHASES.map((phase) => ({
      value: phase.value as string,
      label: phase.label,
      hint: phase.hint,
      statuses: list.filter((s) => s.phase === phase.value),
    }));
    const orphans = list.filter((s) => !DEV_PHASES.some((p) => p.value === s.phase));
    return [
      ...known,
      { value: "sans-phase", label: "Sans phase", hint: "Statuts dont la phase n'est pas reconnue", statuses: orphans },
    ].filter((g) => g.statuses.length > 0);
  }, [statuses]);

  /**
   * Poser la carte `id` dans la colonne `status`, à la position `index`.
   *
   * On renumérote la colonne d'arrivée de 1 à N et on n'écrit que les cartes
   * dont le rang a réellement changé. Des rangs pleins plutôt que des demis
   * (1,5 ; 1,75) : l'utilisateur raisonne en « première », « deuxième », et un
   * rang qu'on peut lire est un rang qu'on peut corriger.
   */
  const move = useCallback(
    async (id: number | string, status: DevStatusDoc, index: number) => {
      const before = docs;
      const statusId = String(status.id);
      const moved = (docs ?? []).find((d) => String(d.id) === String(id));
      if (!moved) return;

      const shown = byStatus[statusId] ?? [];
      const column = shown.filter((d) => String(d.id) !== String(id));
      /**
       * L'index visé est compté sur la colonne AFFICHÉE, carte tenue comprise ;
       * il s'applique ici à la colonne PRIVÉE d'elle. Quand la carte descend
       * dans sa propre colonne, tout ce qui la suivait a déjà reculé d'un cran :
       * sans cette correction, elle sautait une place de trop.
       */
      const from = shown.findIndex((d) => String(d.id) === String(id));
      const target = from >= 0 && from < index ? index - 1 : index;
      const at = Math.max(0, Math.min(target, column.length));
      const ordered = [...column.slice(0, at), moved, ...column.slice(at)];

      const changed: { id: number | string; rank: number; status?: number | string }[] = [];
      ordered.forEach((doc, i) => {
        const rank = i + 1;
        const isMoved = String(doc.id) === String(id);
        const changedColumn = isMoved && refId(doc.status) !== statusId;
        if (doc.rank !== rank || changedColumn) {
          changed.push({ id: doc.id, rank, ...(changedColumn ? { status: status.id } : {}) });
        }
      });

      // Optimiste : les cartes suivent le curseur tout de suite. En cas
      // d'échec on remet l'état d'avant — une carte qui revient en place dit
      // mieux qu'un message que le changement n'a pas pris.
      setDocs((current) =>
        (current ?? []).map((doc) => {
          const patch = changed.find((c) => String(c.id) === String(doc.id));
          if (!patch) return doc;
          return {
            ...doc,
            rank: patch.rank,
            ...(patch.status != null
              ? { status: { id: status.id, name: status.name ?? undefined, color: status.color ?? undefined } }
              : {}),
          };
        }),
      );

      try {
        for (const patch of changed) {
          const res = await fetch(`/payload-api/developments/${patch.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              patch.status != null ? { rank: patch.rank, status: patch.status } : { rank: patch.rank },
            ),
          });
          if (!res.ok) throw new Error(String(res.status));
        }
      } catch {
        setDocs(before);
        setError("Le classement n'a pas été enregistré.");
      }
    },
    [byStatus, docs],
  );

  if (error && !docs) {
    return (
      <p className="tim-kanban__error" onClick={() => window.location.reload()}>
        {error}
      </p>
    );
  }
  if (!docs || !statuses) return <p className="tim-kanban__msg">Chargement…</p>;
  if (statuses.length === 0) {
    return (
      <p className="tim-kanban__msg">
        Aucune colonne définie. Créez des statuts dans « Paramètres › Statuts » pour voir le tableau.
      </p>
    );
  }

  return (
    <>
      {error ? (
        <p className="tim-kanban__error" onClick={() => setError(null)}>
          {error}
        </p>
      ) : null}
      <div className="dev-board">
        {groups.map((group) => {
          const total = group.statuses.reduce((n, s) => n + (byStatus[String(s.id)]?.length ?? 0), 0);
          return (
            <section key={group.value} className="dev-board__phase">
              <header className="dev-board__phase-head" title={group.hint}>
                <span className="dev-board__phase-name">{group.label}</span>
                <span className="dev-board__phase-count">{total}</span>
              </header>

              <div className="tim-kanban">
                {group.statuses.map((s) => {
                  const cards = byStatus[String(s.id)] ?? [];
                  const colors = paletteColor(s.color);
                  return (
                    <div
                      key={String(s.id)}
                      className={`tim-kanban__col${over?.status === String(s.id) ? " tim-kanban__col--over" : ""}`}
                      // Survol de la colonne hors d'une carte : on vise le bas
                      // de la pile. Les cartes, elles, affinent l'index.
                      onDragOver={(e) => {
                        e.preventDefault();
                        setOver({ index: cards.length, status: String(s.id) });
                      }}
                      onDragLeave={() => setOver((c) => (c?.status === String(s.id) ? null : c))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const at = over?.status === String(s.id) ? over.index : cards.length;
                        setOver(null);
                        if (dragged != null) void move(dragged, s, at);
                        setDragged(null);
                      }}
                    >
                      <div className="tim-kanban__col-head">
                        <div className="tim-kanban__col-titlebar" title={s.hint ?? undefined}>
                          <span className="tim-kanban__dot" style={{ background: colors.fg }} />
                          <span className="tim-kanban__col-title">{s.name}</span>
                          <span className="tim-kanban__count">{cards.length}</span>
                        </div>
                      </div>

                      <div className="tim-kanban__col-body">
                        {cards.map((doc, cardIndex) => {
                          const type = devMeta("type", doc.type ?? "");
                          const priority = devMeta("priority", doc.priority ?? "");
                          const late = isLate(doc.dueDate);
                          // Les assignés arrivent peuplés (depth=1) : on en tire
                          // des noms, pas des identifiants.
                          const people = (Array.isArray(doc.assignee)
                            ? doc.assignee
                            : doc.assignee == null
                              ? []
                              : [doc.assignee]
                          )
                            .map((ref) => nameOf(ref))
                            .filter(Boolean);
                          // Web, Mobile, ou les deux : une carte mobile et une
                          // carte web ne se traitent pas au même endroit, et ça
                          // doit se voir sans ouvrir la fiche.
                          const platforms = (Array.isArray(doc.platforms)
                            ? doc.platforms
                            : doc.platforms == null
                              ? []
                              : [doc.platforms]
                          )
                            .map((ref) => nameOf(ref))
                            .filter(Boolean);
                          // Les clients qui attendent : leurs initiales suffisent
                          // sur une carte, le nom complet vient au survol.
                          const clients = (Array.isArray(doc.opportunities)
                            ? doc.opportunities
                            : doc.opportunities == null
                              ? []
                              : [doc.opportunities]
                          )
                            .map((ref) => companyOf(ref))
                            .filter(Boolean);
                          const dropHere =
                            over?.status === String(s.id) && over.index === cardIndex;
                          return (
                            <article
                              key={String(doc.id)}
                              className={`tim-kanban__card${dropHere ? " tim-kanban__card--drop" : ""}${
                                String(dragged ?? "") === String(doc.id) ? " tim-kanban__card--moving" : ""
                              }`}
                              draggable
                              onDragStart={() => setDragged(doc.id)}
                              onDragEnd={() => setDragged(null)}
                              /**
                               * Moitié haute = avant cette carte, moitié basse =
                               * après. C'est ce qui permet de dire « celle-ci
                               * passe première » plutôt que seulement « celle-ci
                               * change de colonne ».
                               */
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const box = e.currentTarget.getBoundingClientRect();
                                const after = e.clientY > box.top + box.height / 2;
                                setOver({ index: cardIndex + (after ? 1 : 0), status: String(s.id) });
                              }}
                              onClick={() => router.push(`/admin/collections/developments/${doc.id}`)}
                            >
                              {/* Même grammaire que les cartes d'opportunité :
                                  le titre, puis ce qui qualifie, puis QUI, puis
                                  une ligne d'état, puis un pied séparé d'un
                                  filet. Deux tableaux dans le même back-office
                                  doivent se lire de la même façon. */}
                              <div className="tim-kanban__card-title">{doc.title ?? "Sans titre"}</div>

                              <div className="dev-card__top">
                                <span className="dev-pill" style={{ color: type.fg, background: type.bg }}>
                                  {type.label}
                                </span>
                                {/* Seules les urgences se signalent : afficher
                                    « Normale » sur chaque carte ne dirait rien. */}
                                {doc.priority === "urgente" || doc.priority === "haute" ? (
                                  <span
                                    className="dev-pill"
                                    style={{ color: priority.fg, background: priority.bg }}
                                  >
                                    {priority.label}
                                  </span>
                                ) : null}
                              </div>

                              {/* QUI s'en occupe, en pastille — l'équivalent de
                                  l'apporteur sur une carte d'opportunité. */}
                              {people.length > 0 ? (
                                <div className="tim-kanban__chip" title={people.join(", ")}>
                                  <span className="tim-kanban__avatar">{initialsOf(people[0])}</span>
                                  <span className="tim-kanban__chip-name">
                                    {people[0]}
                                    {people.length > 1 ? ` +${people.length - 1}` : ""}
                                  </span>
                                </div>
                              ) : null}

                              {/* L'avancement de la checklist là où on regarde
                                  les cartes : « 4/7 » dit en un coup d'œil ce
                                  qu'il reste, ce que le statut seul ne dit pas. */}
                              {doc.checklistProgress ? (
                                <div className="dev-card__check">
                                  <span className="dev-progress dev-progress--cell">
                                    <span className="dev-progress__bar">
                                      <span
                                        className="dev-progress__fill"
                                        style={{ width: `${progressPct(doc.checklistProgress)}%` }}
                                      />
                                    </span>
                                    <span className="dev-progress__text">{doc.checklistProgress}</span>
                                  </span>
                                </div>
                              ) : null}

                              {/* Le pied, séparé d'un filet : le RANG d'abord —
                                  c'est un repère de classement, pas une
                                  qualification du développement, et il se lit
                                  aussi bien en bas de carte où il ne dispute
                                  rien au titre. Puis ce qui sert à arbitrer
                                  (combien attendent), et la date promise. */}
                              <footer className="tim-kanban__foot">
                                  <span className="tim-kanban__foot-left">
                                    <span className="dev-card__rank">{cardIndex + 1}</span>
                                    {/* QUI attend ce développement : les
                                        initiales des entreprises, le nom entier
                                        au survol. Trois au plus — au-delà, la
                                        ligne de pied deviendrait une liste. */}
                                    {clients.length > 0 ? (
                                      <span
                                        className="dev-card__clients dev-tip"
                                        data-tip={`Demandé par\n${clients.join("\n")}`}
                                      >
                                        {clients.slice(0, 3).map((name) => (
                                          <span key={name} className="dev-card__client">
                                            {initialsOf(name)}
                                          </span>
                                        ))}
                                        {clients.length > 3 ? (
                                          <span className="dev-card__client dev-card__client--more">
                                            +{clients.length - 3}
                                          </span>
                                        ) : null}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="dev-card__right">
                                    {doc.dueDate ? (
                                      <span
                                        className={`tim-kanban__foot-date${late ? " dev-card__due--late" : ""}`}
                                        title={late ? "Échéance dépassée" : "Échéance promise"}
                                      >
                                        {dayMonth(doc.dueDate)}
                                      </span>
                                    ) : null}
                                    {/* Web, mobile, ou les deux : un signe plutôt
                                        qu'un mot — sur une carte, « Web » et
                                        « Mobile » écrits en toutes lettres pèsent
                                        autant que le titre. */}
                                    {platforms.map((name) => (
                                      <span key={name} className="dev-card__platform" title={name}>
                                        {platformKind(name) === "mobile" ? (
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={name}>
                                            <rect x="6" y="2.5" width="12" height="19" rx="2" />
                                            <path d="M11 18.5h2" />
                                          </svg>
                                        ) : platformKind(name) === "web" ? (
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={name}>
                                            <rect x="2.5" y="4" width="19" height="13" rx="2" />
                                            <path d="M8 20.5h8M12 17v3.5" />
                                          </svg>
                                        ) : (
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={name}>
                                            <circle cx="12" cy="12" r="8.5" />
                                          </svg>
                                        )}
                                      </span>
                                    ))}
                                  </span>
                              </footer>
                            </article>
                          );
                        })}
                        {/* Le trait de fin : déposer sous la dernière carte. */}
                        {over?.status === String(s.id) && over.index >= cards.length ? (
                          <span className="tim-kanban__dropline" aria-hidden="true" />
                        ) : null}
                        {cards.length === 0 ? <p className="tim-kanban__empty">—</p> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
