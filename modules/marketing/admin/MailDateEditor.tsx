"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { clampMailDate, type MailDateWindow } from "@/modules/marketing/lib/journey";

/**
 * Date d'envoi d'un e-mail, modifiable là où elle se lit — dans la barre
 * d'étapes.
 *
 * Un tableau séparé obligeait à faire le lien de tête entre « l'e-mail de la
 * ligne 7 » et l'étape concernée. La date est désormais affichée contre son
 * étape, et un clic dessus ouvre de quoi la changer.
 *
 * Trois gestes, qui couvrent tout ce qu'on veut faire d'un envoi :
 *   - choisir une date  → elle est FIXÉE (elle cesse de suivre le calendrier) ;
 *   - ne pas envoyer    → date vidée, l'e-mail ne partira pas ;
 *   - rétablir          → retour à la date calculée par le parcours.
 *
 * Rendu par PORTAIL sur <body> : la liste d'étapes a son propre `overflow`, qui
 * rognerait un panneau positionné dans le flux.
 */

/** `datetime-local` attend `YYYY-MM-DDTHH:mm` en heure LOCALE, pas de l'ISO UTC. */
const toLocalInput = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Jour + mois seulement : cette date occupe la colonne des échéances, à côté de
 * celles des étapes, et doit s'aligner avec elles. L'heure d'envoi est la même
 * pour presque tous les messages — elle se lit dans le panneau et l'infobulle,
 * là où on en a besoin.
 */
const fmtDay = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : null;

const fmtFull = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

export function MailDateEditor({
  subject,
  scheduledAt,
  computedAt,
  overridden,
  sentAt,
  readOnly,
  sansObjet,
  window: bounds,
  onChange,
}: {
  subject: string;
  scheduledAt?: string | null;
  /** Date que le calendrier du parcours produirait — cible du « rétablir ». */
  computedAt?: string | null;
  overridden?: boolean;
  sentAt?: string | null;
  readOnly?: boolean;
  /**
   * Motif pour lequel cet envoi n'a plus lieu d'être (« créneau déjà
   * réservé »). La date reste en base — annuler le créneau doit tout
   * remettre en marche —, mais elle ne se règle plus : le cron écartera
   * l'envoi quoi qu'on inscrive ici.
   */
  sansObjet?: string | null;
  /** Bornes autorisées, déduites des étapes voisines. */
  window: MailDateWindow;
  onChange: (at: string | null, overridden: boolean) => void;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setAnchor(null), []);

  const toggle = useCallback((e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchor((a) => (a ? null : { x: r.right, y: r.bottom + 6 }));
  }, []);

  // Fermeture au clic extérieur et à Échap : un panneau flottant qui reste
  // ouvert pendant qu'on travaille ailleurs finit par masquer une autre ligne.
  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, close]);

  // Déjà parti : la date devient un fait, plus un réglage.
  if (sentAt) {
    return (
      <span
        className="jr-maildate jr-maildate--sent"
        title={`« ${subject} » — envoyé le ${fmtFull(sentAt)}`}
      >
        envoyé {fmtDay(sentAt)}
      </span>
    );
  }

  // Le fait a rendu l'envoi inutile : on le dit, plutôt que d'afficher une
  // échéance réglable pour un message qui ne partira pas.
  if (sansObjet) {
    return (
      <span
        className="jr-maildate jr-maildate--moot"
        title={`« ${subject} » ne partira pas — ${sansObjet}${
          scheduledAt ? ` (était prévu le ${fmtFull(scheduledAt)})` : ""
        }`}
      >
        sans objet
      </span>
    );
  }

  const off = !scheduledAt && overridden;
  const label = off ? "sans envoi" : (fmtDay(scheduledAt) ?? "sans date");

  if (readOnly) {
    return <span className="jr-maildate jr-maildate--ro">{label}</span>;
  }

  return (
    <>
      <button
        type="button"
        className={[
          "jr-maildate",
          overridden && !off && "jr-maildate--fixed",
          off && "jr-maildate--off",
          anchor && "jr-maildate--open",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={toggle}
        aria-expanded={Boolean(anchor)}
        aria-label={`Modifier la date d'envoi de « ${subject} »`}
        title={
          off
            ? `« ${subject} » ne sera pas envoyé — cliquer pour rétablir`
            : `« ${subject} » — ${fmtFull(scheduledAt) ?? "sans date"}. Cliquer pour modifier.`
        }
      >
        {label}
      </button>

      {anchor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className="jr-datepop"
            style={{
              // Aligné à droite sur le bouton, puis borné aux DEUX bords : sans
              // la borne basse, un écran étroit poussait le panneau hors de
              // l'écran par la gauche, là où rien ne le rattrape.
              left: Math.max(8, Math.min(anchor.x, window.innerWidth - 16) - 260),
              top: anchor.y,
            }}
          >
            <p className="jr-datepop__title">{subject}</p>

            <input
              type="datetime-local"
              className="jr-datepop__input"
              value={toLocalInput(scheduledAt)}
              min={toLocalInput(bounds.min)}
              max={toLocalInput(bounds.max)}
              autoFocus
              onChange={(e) => {
                if (!e.target.value) return onChange(null, true);
                // `min`/`max` ne font qu'orienter le sélecteur : une date tapée
                // au clavier les traverse. On recadre donc à l'écriture.
                onChange(clampMailDate(new Date(e.target.value).toISOString(), bounds), true);
              }}
            />

            {(bounds.min || bounds.max) && (
              <p className="jr-datepop__bounds">
                Déplaçable {bounds.min ? `du ${fmtDay(bounds.min)}` : ""}
                {bounds.max ? ` au ${fmtDay(bounds.max)}` : ""} — la date doit rester entre
                l&apos;étape précédente et la suivante.
              </p>
            )}

            <p className="jr-datepop__state">
              {off
                ? "Cet e-mail ne sera pas envoyé."
                : overridden
                  ? "Date fixée : elle ne bougera plus si la durée du test change."
                  : "Suit le calendrier : elle se recalcule avec la durée du test."}
            </p>

            <div className="jr-datepop__actions">
              {!off && (
                <button
                  type="button"
                  className="jr-datepop__btn"
                  onClick={() => {
                    // Vider la date VAUT « ne pas envoyer » : un seul geste
                    // plutôt qu'un second réglage disant la même chose.
                    onChange(null, true);
                    close();
                  }}
                >
                  Ne pas envoyer
                </button>
              )}
              {overridden && computedAt && (
                <button
                  type="button"
                  className="jr-datepop__btn jr-datepop__btn--reset"
                  onClick={() => {
                    onChange(computedAt, false);
                    close();
                  }}
                >
                  Rétablir {fmtDay(computedAt)}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
