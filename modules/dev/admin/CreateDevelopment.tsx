"use client";

import {
  Drawer,
  toast,
  useDocumentInfo,
  useDrawerSlug,
  useField,
  useModal,
} from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DEFAULT_DEV_PRIORITY,
  DEFAULT_DEV_TYPE,
  DEV_PRIORITIES,
  DEV_TYPES,
} from "@/modules/dev/lib/devMeta";
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
  prefill?: { title?: string; description?: string; type?: string; priority?: string };
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

  /** Ajoute un point à la checklist en construction. */
  const addPoint = () => {
    const clean = newPoint.trim();
    if (!clean) return;
    setPoints((list) => [...list, { description: "", title: clean }]);
    setNewPoint("");
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
              Le développement est créé immédiatement, dans la première colonne du tableau, rattaché
              à cette fiche.
            </p>
          </section>
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
