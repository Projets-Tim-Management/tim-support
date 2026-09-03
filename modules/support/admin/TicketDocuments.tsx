"use client";

import { useForm, useFormFields } from "@payloadcms/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { formatOctets, uploadFile, type MediaLite } from "@/core/lib/media-upload";

/**
 * Documents d'un ticket, en MOSAÏQUE.
 *
 * Le tableau replié de Payload annonçait « Document 01, 02… » : pour retrouver
 * une capture d'écran, il fallait déplier chaque ligne. Une pièce se reconnaît
 * d'abord à ce qu'elle montre — on affiche donc l'aperçu, et le détail
 * (intitulé, note, dépôt) s'ouvre au clic.
 *
 * Ce composant REMPLACE le rendu du tableau `documents` ; le champ, lui, ne
 * change pas. Les lignes restent des lignes de tableau Payload, avec la même
 * validation, le même enregistrement et la même purge à 30 jours.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Ligne = {
  index: number;
  fileId: number | string | null;
  label: string;
  note: string;
  addedAt: string | null;
  addedBy: number | string | null;
};

const estImage = (m?: MediaLite | null): boolean =>
  Boolean(m && (m.mimeType?.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(m.url ?? "")));

/** Extension en majuscules, pour la pastille d'un fichier sans aperçu. */
const extension = (m?: MediaLite | null): string => {
  const nom = m?.filename ?? m?.url ?? "";
  const ext = nom.split("?")[0].split(".").pop();
  return ext && ext.length <= 5 ? ext.toUpperCase() : "FICHIER";
};

const jour = (iso?: string | null): string | null =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : null;

/** Identifiant d'un lien Payload, résolu (objet) ou non (id nu). */
const idDe = (v: unknown): number | string | null => {
  if (v == null) return null;
  if (typeof v === "object") {
    const id = (v as { id?: unknown }).id;
    return typeof id === "number" || typeof id === "string" ? id : null;
  }
  return typeof v === "number" || typeof v === "string" ? v : null;
};

export function TicketDocuments(props: any) {
  const path: string = props?.path ?? "documents";
  const schemaPath: string = props?.schemaPath ?? props?.field?.name ?? path;
  const readOnly = Boolean(props?.readOnly);
  const description: string | undefined = props?.field?.admin?.description;

  const { addFieldRow, dispatchFields, removeFieldRow, setModified } = useForm();

  // Lecture des lignes : Payload aplatit les tableaux en chemins
  // (`documents.0.file`…). On remonte tant qu'une ligne existe.
  const lignes = useFormFields(([fields]) => {
    const out: Ligne[] = [];
    for (let i = 0; fields[`${path}.${i}.file`] !== undefined; i += 1) {
      out.push({
        index: i,
        fileId: idDe(fields[`${path}.${i}.file`]?.value),
        label: String(fields[`${path}.${i}.label`]?.value ?? ""),
        note: String(fields[`${path}.${i}.note`]?.value ?? ""),
        addedAt: (fields[`${path}.${i}.addedAt`]?.value as string | undefined) ?? null,
        addedBy: idDe(fields[`${path}.${i}.addedBy`]?.value),
      });
    }
    return out;
  });

  const [medias, setMedias] = useState<Record<string, MediaLite>>({});
  const [auteurs, setAuteurs] = useState<Record<string, string>>({});
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  /** Résout les fichiers affichés (aperçu, nom, taille). Une fois par id. */
  useEffect(() => {
    const manquants = lignes
      .map((l) => l.fileId)
      .filter((id): id is number | string => id != null && !medias[String(id)]);
    if (manquants.length === 0) return;
    let annule = false;
    void Promise.all(
      [...new Set(manquants)].map((id) =>
        fetch(`/payload-api/media/${id}?depth=0`, { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((docs) => {
      if (annule) return;
      const ajout: Record<string, MediaLite> = {};
      for (const d of docs) if (d?.id != null) ajout[String(d.id)] = d as MediaLite;
      if (Object.keys(ajout).length) setMedias((m) => ({ ...m, ...ajout }));
    });
    return () => {
      annule = true;
    };
  }, [lignes, medias]);

  /** Le nom de qui a déposé : un identifiant nu ne dit rien à personne. */
  useEffect(() => {
    const manquants = lignes
      .map((l) => l.addedBy)
      .filter((id): id is number | string => id != null && !auteurs[String(id)]);
    if (manquants.length === 0) return;
    let annule = false;
    void Promise.all(
      [...new Set(manquants)].map((id) =>
        fetch(`/payload-api/users/${id}?depth=0`, { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .then((u) => [id, u] as const)
          .catch(() => [id, null] as const),
      ),
    ).then((paires) => {
      if (annule) return;
      const ajout: Record<string, string> = {};
      for (const [id, u] of paires) {
        const nom = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim();
        ajout[String(id)] = nom || u?.email || `#${id}`;
      }
      setAuteurs((a) => ({ ...a, ...ajout }));
    });
    return () => {
      annule = true;
    };
  }, [lignes, auteurs]);

  const ecrire = useCallback(
    (index: number, champ: string, value: unknown) => {
      dispatchFields({ type: "UPDATE", path: `${path}.${index}.${champ}`, value });
      setModified(true);
    },
    [dispatchFields, path, setModified],
  );

  const ajouter = useCallback(
    async (fichiers: FileList | null) => {
      if (!fichiers?.length) return;
      setBusy(true);
      setErreur(null);
      for (const fichier of Array.from(fichiers)) {
        const envoi = await uploadFile(fichier);
        if (!envoi.ok) {
          // Le message vient de la lib d'envoi : il dit ce qui est reproché au
          // fichier, pas « une erreur est survenue ».
          setErreur(envoi.message);
          break;
        }
        setMedias((m) => ({ ...m, [String(envoi.doc.id)]: envoi.doc }));
        // Les valeurs partent AVEC la ligne : posées juste après, elles
        // courraient après la mise à jour de l'état du formulaire.
        addFieldRow({
          path,
          schemaPath,
          subFieldState: {
            file: { value: envoi.doc.id, initialValue: envoi.doc.id, valid: true },
            label: { value: "", initialValue: "", valid: true },
            note: { value: "", initialValue: "", valid: true },
          } as never,
        });
        setModified(true);
      }
      setBusy(false);
      if (input.current) input.current.value = "";
    },
    [addFieldRow, path, schemaPath, setModified],
  );

  const retirer = useCallback(
    (index: number) => {
      removeFieldRow({ path, rowIndex: index });
      setModified(true);
      setOuvert(null);
    },
    [removeFieldRow, path, setModified],
  );

  // Échap ferme le détail : un panneau qui ne se ferme qu'à la souris oblige à
  // viser une croix pour revenir à la mosaïque.
  useEffect(() => {
    if (ouvert == null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOuvert(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ouvert]);

  const detail = ouvert != null ? lignes.find((l) => l.index === ouvert) : null;
  const media = detail?.fileId != null ? medias[String(detail.fileId)] : null;

  return (
    <div className="tk-docs">
      {description && <p className="tk-docs__intro">{description}</p>}

      <div className="tk-docs__grid">
        {lignes.map((l) => {
          const m = l.fileId != null ? medias[String(l.fileId)] : null;
          const titre = l.label.trim() || m?.filename || "Sans nom";
          return (
            <button
              key={`${l.index}-${l.fileId}`}
              type="button"
              className="tk-doc"
              onClick={() => setOuvert(l.index)}
              title={titre}
            >
              <span className="tk-doc__vue">
                {estImage(m) && m?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="tk-doc__img" />
                ) : (
                  <span className="tk-doc__ext">{extension(m)}</span>
                )}
              </span>
              <span className="tk-doc__nom">{titre}</span>
              <span className="tk-doc__meta">{jour(l.addedAt) ?? "à enregistrer"}</span>
            </button>
          );
        })}

        {!readOnly && (
          <>
            <button
              type="button"
              className="tk-doc tk-doc--add"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              <span className="tk-doc__plus" aria-hidden>
                +
              </span>
              <span className="tk-doc__nom">{busy ? "Envoi…" : "Ajouter"}</span>
              <span className="tk-doc__meta">image, PDF, archive…</span>
            </button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => void ajouter(e.target.files)}
            />
          </>
        )}
      </div>

      {erreur && <p className="tk-docs__erreur">{erreur}</p>}

      {lignes.length === 0 && !readOnly && (
        <p className="tk-docs__vide">
          Aucune pièce pour l&apos;instant. Les documents ajoutés ici restent internes.
        </p>
      )}

      {detail &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="tk-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Détail du document"
            onClick={(e) => e.target === e.currentTarget && setOuvert(null)}
          >
            <div className="tk-modal__panel">
              <header className="tk-modal__head">
                <h3 className="tk-modal__title">
                  {detail.label.trim() || media?.filename || "Document"}
                </h3>
                <p className="tk-modal__sub">
                  {media?.filename}
                  {typeof (media as any)?.filesize === "number" &&
                    ` · ${formatOctets((media as any).filesize)}`}
                  {detail.addedAt && ` · déposé le ${jour(detail.addedAt)}`}
                  {detail.addedBy != null && ` par ${auteurs[String(detail.addedBy)] ?? "…"}`}
                  {!detail.addedAt && " · signature à l'enregistrement"}
                </p>
              </header>

              <div className="tk-modal__body">
                {/* L'aperçu prend la place disponible : on ouvre ce panneau
                    pour VOIR la pièce ; une vignette de plus n'y servirait à
                    rien. Les champs passent à côté sur un écran large, dessous
                    sur un écran étroit. */}
                <div className="tk-modal__vue">
                  {estImage(media) && media?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={media.url} alt="" className="tk-modal__img" />
                  ) : (
                    <span className="tk-doc__ext tk-doc__ext--grand">{extension(media)}</span>
                  )}
                </div>

                <div className="tk-modal__infos">
                <label className="tk-modal__champ">
                  <span>Intitulé</span>
                  <input
                    type="text"
                    value={detail.label}
                    placeholder={media?.filename ?? "Ce qu'on cherchera dans six mois"}
                    readOnly={readOnly}
                    onChange={(e) => ecrire(detail.index, "label", e.target.value)}
                  />
                </label>

                <label className="tk-modal__champ">
                  <span>Note</span>
                  <textarea
                    rows={3}
                    value={detail.note}
                    placeholder="D'où vient cette pièce, ce qu'elle montre."
                    readOnly={readOnly}
                    onChange={(e) => ecrire(detail.index, "note", e.target.value)}
                  />
                </label>
                </div>
              </div>

              <footer className="tk-modal__actions">
                {!readOnly && (
                  <button
                    type="button"
                    className="tk-btn tk-btn--danger"
                    onClick={() => retirer(detail.index)}
                  >
                    Retirer
                  </button>
                )}
                {media?.url && (
                  <a
                    className="tk-btn"
                    href={media.url}
                    target="_blank"
                    rel="noreferrer"
                    download={media.filename}
                  >
                    Ouvrir le fichier
                  </a>
                )}
                <button type="button" className="tk-btn tk-btn--ghost" onClick={() => setOuvert(null)}>
                  Fermer
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
