"use client";

import { FieldLabel, useField, useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { formatOctets, isVideoMedia, uploadFile, type MediaLite } from "@/core/lib/media-upload";
import { convertToLoop, isVideoFile, type LoopFormat } from "@/core/lib/video-loop";
import { MediaPicker } from "@/modules/editorial/admin/MediaPicker";
import { extOf, featureMediaName } from "@/modules/editorial/lib/media-name";
import type { Range } from "@/core/lib/video-trim";
import UploadZone from "./UploadZone";
import { VideoTrimmer } from "./VideoTrimmer";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Champ upload en DROPZONE, sans le drawer de Payload :
 *   - clic OU glisser-déposer → sélecteur de fichier / dépôt direct ;
 *   - envoi du/des fichier(s) à la collection `media` via l'API REST ;
 *   - pose l'id (ou le tableau d'ids) dans le champ (relation upload standard) ;
 *   - aperçu (image) ou nom de fichier (document) + retrait.
 * Gère mono-fichier ET multi (`hasMany`), image ET document.
 *
 * Branché via `admin.components.Field` sur les champs `type: "upload"`.
 * Options par champ via `admin.custom` :
 *   - `{ accept, noun }` ;
 *   - `convertVideo` : une capture vidéo déposée est convertie DANS LE
 *     NAVIGATEUR en courte vidéo MP4 en boucle (voir core/lib/video-loop) —
 *     seule la vidéo finale est envoyée ;
 *   - `nameFrom: "feature"` : le fichier prend un nom tiré de la feature et de
 *     sa place (voir modules/editorial/lib/media-name) ;
 *   - `pickExisting` : un lien sous la zone reprend un média déjà dans la
 *     médiathèque (une vidéo d'une autre feature), sans rien renvoyer.
 */

function isImage(m?: MediaLite | null): boolean {
  if (!m) return false;
  if (m.mimeType) return m.mimeType.startsWith("image/");
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(m.url ?? "");
}

async function fetchMedia(id: string | number): Promise<MediaLite | null> {
  try {
    const r = await fetch(`/payload-api/media/${id}?depth=0`, { credentials: "include" });
    return (await r.json()) as MediaLite;
  } catch {
    return null;
  }
}

export default function DirectUpload(props: any) {
  const path: string = props?.path ?? props?.field?.name;
  const label = props?.field?.label ?? props?.field?.name;
  const hasMany = Boolean(props?.field?.hasMany);
  const readOnly = Boolean(props?.readOnly);
  // `admin.className` du champ, comme sur un champ natif : c'est ce qui permet
  // à un logo (entier, hauteur bornée) de ne pas être rogné comme un avatar.
  const className: string = props?.field?.admin?.className ?? "";
  const custom = props?.field?.admin?.custom ?? {};
  const accept: string = custom.accept ?? "image/*";
  const noun: string = custom.noun ?? "une image";
  const convertVideo = Boolean(custom.convertVideo);
  const nameFromFeature = custom.nameFrom === "feature";
  const pickExisting = Boolean(custom.pickExisting);
  const [picking, setPicking] = useState(false);
  // Le slug (à défaut le titre) de la feature, pour nommer le fichier.
  const featureName = useFormFields(([fields]) =>
    nameFromFeature ? String(fields.slug?.value || fields.title?.value || "") : "",
  );

  const { value, setValue } = useField<any>({ path });
  const [items, setItems] = useState<MediaLite[]>([]);
  const [busy, setBusy] = useState(false);
  /**
   * L'échec du dernier envoi, en toutes lettres.
   *
   * Sans lui, un envoi refusé ne produisait RIEN à l'écran : la zone de dépôt
   * restait vide, exactement comme avant le clic. On croyait à un geste raté et
   * on recommençait, indéfiniment.
   */
  const [erreur, setErreur] = useState<string | null>(null);
  /** Conversion vidéo en cours : où on en est, en toutes lettres. */
  const [progress, setProgress] = useState<string | null>(null);
  /** Ce que la conversion a produit, dit une fois (poids avant / après). */
  const [info, setInfo] = useState<string | null>(null);
  /**
   * La capture en cours de retouche, et la promesse qui attend le choix :
   * l'envoi reprend quand on clique « Convertir » (ou s'arrête sur « Annuler »).
   */
  const [trimming, setTrimming] = useState<{ file: File; resolve: (keep: Range[] | null) => void } | null>(null);
  const askTrim = (file: File) => new Promise<Range[] | null>((resolve) => setTrimming({ file, resolve }));

  // Résout la/les valeur(s) actuelle(s) en médias pour l'aperçu.
  useEffect(() => {
    let cancelled = false;
    const ids: any[] = hasMany
      ? Array.isArray(value)
        ? value
        : []
      : value != null
        ? [value]
        : [];
    (async () => {
      const resolved = await Promise.all(
        ids.map(async (v) => (v && typeof v === "object" ? v : await fetchMedia(v))),
      );
      if (!cancelled) setItems(resolved.filter(Boolean) as MediaLite[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [value, hasMany]);

  const addFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0 || readOnly) return;
    setBusy(true);
    setErreur(null);
    setInfo(null);
    const uploaded: MediaLite[] = [];
    const echecs: string[] = [];
    const notes: string[] = [];
    const lot = hasMany ? arr : [arr[0]];
    for (const [i, original] of lot.entries()) {
      let f = original;
      let format: LoopFormat | null = null;
      if (convertVideo && isVideoFile(original)) {
        // D'abord la retouche : retirer les passages qui ne vont pas.
        const keep = await askTrim(original);
        if (!keep) continue;
        try {
          setProgress("Préparation de la vidéo…");
          const out = await convertToLoop(
            original,
            (x) => setProgress(`Conversion de la vidéo… ${Math.round(x * 100)} %`),
            keep,
          );
          format = out.format;
          f = new File([out.blob], "capture.mp4", { type: "video/mp4" });
          notes.push(
            `Vidéo ${out.format === "mobile" ? "mobile" : "ordinateur"} ${out.width} × ${out.height} : ${formatOctets(out.blob.size)} (capture d'origine : ${formatOctets(original.size)}).`,
          );
        } catch (e) {
          echecs.push((e as Error).message);
          continue;
        } finally {
          setProgress(null);
        }
      }
      if (nameFromFeature) {
        const name = featureMediaName({
          slug: featureName,
          path,
          ext: extOf(f.name) || (f.type === "video/mp4" ? "mp4" : "bin"),
          format,
          index: lot.length > 1 ? i + 1 : null,
        });
        f = new File([f], name, { type: f.type });
      }
      if (convertVideo && isVideoFile(original)) setProgress("Envoi de la vidéo…");
      const envoi = await uploadFile(f);
      setProgress(null);
      if (envoi.ok) uploaded.push(envoi.doc);
      // Le NOM du fichier fautif : sur un dépôt multiple, « échec » sans nom
      // oblige à tout recommencer pour trouver lequel.
      else echecs.push(arr.length > 1 ? `${f.name} — ${envoi.message}` : envoi.message);
    }
    if (echecs.length) setErreur(echecs.join("\n"));
    if (notes.length) setInfo(notes.join("\n"));
    if (uploaded.length) {
      if (hasMany) {
        const existing = Array.isArray(value) ? value : [];
        setValue([...existing, ...uploaded.map((d) => d.id)]);
      } else {
        setValue(uploaded[0].id);
      }
    }
    setBusy(false);
  };

  const removeAt = (idx: number) => {
    setErreur(null);
    if (hasMany) {
      const arr = (Array.isArray(value) ? value : []).slice();
      arr.splice(idx, 1);
      setValue(arr);
    } else {
      setValue(null);
    }
  };

  const showZone = hasMany || items.length === 0;

  return (
    <div className={`field-type direct-upload${className ? ` ${className}` : ""}`}>
      {label && <FieldLabel label={label} path={path} />}

      {items.length > 0 && (
        <div className={`direct-upload__grid${hasMany ? "" : " direct-upload__grid--single"}`}>
          {items.map((m, i) => (
            <div key={`${m.id}-${i}`} className="direct-upload__thumb">
              {isVideoMedia(m) ? (
                <>
                  {/* Comme sur le site : sans son, en boucle, lancée seule. */}
                  <video src={m.url} muted autoPlay loop playsInline />
                  {m.filename && (
                    <span className="direct-upload__name" title={m.filename}>
                      {m.filename}
                    </span>
                  )}
                </>
              ) : isImage(m) ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.filename ?? ""} />
                  {/* Le NOM sous la vignette.
                      Une image posée ne se reconnaît pas toujours à sa
                      vignette : deux captures du même écran se ressemblent, et
                      un GIF n'affiche que sa première image. Sans le nom, la
                      seule façon de savoir lequel on a mis était de le
                      télécharger. Il est tronqué à l'affichage, entier au
                      survol — un nom de fichier tient rarement en une ligne. */}
                  {m.filename && (
                    <span className="direct-upload__name" title={m.filename}>
                      {m.filename}
                    </span>
                  )}
                </>
              ) : (
                <span className="direct-upload__doc" title={m.filename}>
                  <span className="direct-upload__doc-icon" aria-hidden>
                    📎
                  </span>
                  <span className="direct-upload__doc-name">{m.filename ?? "fichier"}</span>
                </span>
              )}
              {/* Récupérer le fichier était impossible autrement qu'au clic
                  droit : un logo client à reposer dans son compte de test, un
                  contrat signé à archiver, ça se télécharge. Sur un stockage
                  distant (Vercel Blob), le navigateur ouvre l'onglet plutôt que
                  d'enregistrer — `download` ne vaut qu'en même origine. */}
              {m.url && (
                <a
                  className="direct-upload__dl"
                  href={m.url}
                  download={m.filename ?? true}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Télécharger ${m.filename ?? "le fichier"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Télécharger
                </a>
              )}
              {!readOnly && (
                <button
                  type="button"
                  className="direct-upload__remove"
                  onClick={() => removeAt(i)}
                  aria-label="Retirer"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {progress && (
        <p className="direct-upload__progress" role="status">
          {progress}
        </p>
      )}
      {info && !progress && <p className="direct-upload__info">{info}</p>}

      {erreur && (
        <p className="direct-upload__error" role="alert">
          {erreur}
        </p>
      )}

      {trimming && (
        <VideoTrimmer
          file={trimming.file}
          onCancel={() => {
            trimming.resolve(null);
            setTrimming(null);
          }}
          onDone={({ keep }) => {
            trimming.resolve(keep);
            setTrimming(null);
          }}
        />
      )}

      {showZone && !readOnly && (
        <UploadZone
          onFiles={(files) => void addFiles(files)}
          accept={accept}
          noun={noun}
          multiple={hasMany}
          busy={busy}
        />
      )}

      {showZone && !readOnly && pickExisting && (
        <button type="button" className="ctr-link direct-upload__pick" onClick={() => setPicking(true)} disabled={busy}>
          Ou reprendre une vidéo déjà dans la médiathèque…
        </button>
      )}

      {picking && (
        <MediaPicker
          onCancel={() => setPicking(false)}
          onPick={(m) => {
            setErreur(null);
            setInfo(null);
            if (hasMany) setValue([...(Array.isArray(value) ? value : []), m.id]);
            else setValue(m.id);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
