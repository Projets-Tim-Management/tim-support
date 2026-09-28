"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { IconCheck, IconChevronRight, IconCross, IconDownload, IconFile } from "@/components/ui/icons";

/**
 * Aperçu d'un document dans un panneau latéral : on LIT le devis sans quitter
 * la page, et on le télécharge d'un bouton.
 *
 * Un lien « ouvrir dans un nouvel onglet » perdait le client : un onglet de
 * plus, le PDF à plein écran, et plus de fil pour revenir à l'étape. Le
 * panneau garde la page derrière lui — on ferme, on est où on était.
 *
 * Les fichiers sont servis par le CDN (Vercel Blob) : `?download=1` y force le
 * téléchargement (l'attribut `download` ne vaut que sur la même origine).
 * Sur un téléphone, un PDF intégré ne s'affiche pas toujours : le bouton
 * « Télécharger » reste alors le chemin, et on le dit.
 */

export type PreviewDoc = { url: string; filename?: string | null };

const isImage = (name?: string | null) => /\.(png|jpe?g|webp|gif)$/i.test(name ?? "");
/** Lien de téléchargement d'un fichier du CDN (voir plus haut). */
export const downloadUrl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=1`;

export function DocumentDrawer({
  doc,
  title,
  onClose,
  confirmation,
  details,
}: {
  doc: PreviewDoc | null;
  title: string;
  onClose: () => void;
  /** Une ligne sous l'en-tête : qui a signé, quand, la référence. */
  details?: string | null;
  /** Bandeau de confirmation (« Devis signé déposé ») et son bouton de suite. */
  confirmation?: { text: string; cta: string; onContinue: () => void };
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [shown, setShown] = useState(false);

  // Entrée animée, Échap pour fermer, page derrière figée le temps de la lecture.
  useEffect(() => {
    if (!doc) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      cancelAnimationFrame(raf);
      setShown(false);
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [doc, onClose]);

  if (!doc || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`absolute inset-0 bg-foreground/40 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-out sm:max-w-3xl ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
            <IconFile className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{title}</p>
            {doc.filename && <p className="truncate text-sm text-muted">{doc.filename}</p>}
          </div>
          <a
            href={downloadUrl(doc.url)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
          >
            <IconDownload className="h-4 w-4" />
            <span className="hidden sm:inline">Télécharger</span>
          </a>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer l'aperçu"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-surface hover:text-foreground"
          >
            <IconCross className="h-5 w-5" />
          </button>
        </header>

        {details && (
          <div className="flex items-start gap-2 border-b border-border bg-success-bg px-5 py-3 text-sm text-success-text">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{details}</p>
          </div>
        )}

        {confirmation && (
          <div className="flex items-center gap-3 border-b border-border bg-success-bg px-5 py-3">
            <IconCheck className="h-5 w-5 shrink-0 text-success-text" />
            <p className="flex-1 text-sm font-medium text-success-text">{confirmation.text}</p>
            <button
              type="button"
              onClick={confirmation.onContinue}
              className="rounded-md bg-success px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {confirmation.cta}
            </button>
          </div>
        )}

        <div className="relative flex-1 bg-surface">
          {isImage(doc.filename ?? doc.url) ? (
            // eslint-disable-next-line @next/next/no-img-element -- fichier du CDN, dimensions inconnues
            <img src={doc.url} alt={title} className="absolute inset-0 m-auto max-h-full max-w-full object-contain p-4" />
          ) : (
            // Ajusté à la largeur, sans la colonne de miniatures : on lit le
            // document, on ne le feuillette pas.
            <iframe src={`${doc.url}#navpanes=0&view=FitH`} title={title} className="absolute inset-0 h-full w-full" />
          )}
        </div>
        <p className="border-t border-border px-5 py-2 text-center text-xs text-muted">
          L&apos;aperçu ne s&apos;affiche pas&nbsp;? Téléchargez le document.
        </p>
      </aside>
    </div>,
    document.body,
  );
}

/**
 * Une tuile d'action : icône, intitulé, précision, et le verbe à droite.
 *
 * « Voir le devis » et « Signer en ligne » sont deux gestes de même rang sur
 * le même document : ils partagent exactement ce rendu, côte à côte, plutôt
 * qu'une carte d'un côté et un gros bouton de l'autre.
 */
function ActionTile({
  icon,
  title,
  subtitle,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string | null;
  action: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${action} — ${title}`}
      // `min-w-0` : dans une grille, un élément refuse sinon de rétrécir sous la
      // largeur de son texte, et la tuile déborde de la carte sur téléphone.
      className="group flex w-full min-w-0 items-center gap-4 rounded-xl border border-border bg-white p-4 text-left transition hover:border-primary hover:shadow-sm"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary transition group-hover:bg-primary group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{title}</span>
        {subtitle && <span className="block truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {/* Le verbe est dans l'intitulé ; à droite, un chevron suffit. */}
      <IconChevronRight className="h-5 w-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

/** Carte d'un document : un clic ouvre l'aperçu. */
export function DocumentCard({
  doc,
  title,
  subtitle,
  action = "Voir",
}: {
  doc: PreviewDoc;
  title: string;
  subtitle?: string | null;
  action?: string;
}) {
  const [open, setOpen] = useState(false);
  // Stable : le panneau relance son effet (animation, Échap) à chaque nouvelle fonction.
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <ActionTile
        icon={<IconFile className="h-5 w-5" />}
        title={title}
        subtitle={subtitle}
        action={action}
        onClick={() => setOpen(true)}
      />
      <DocumentDrawer doc={open ? doc : null} title={title} onClose={close} />
    </>
  );
}
