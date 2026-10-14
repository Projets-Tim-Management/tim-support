"use client";

import { useField, useFormFields } from "@payloadcms/ui";
import { useRef, useState } from "react";

import { rushPathname, rushRefusal, RUSH_CONTENT_TYPES } from "@/modules/ads/lib/rushes";

/**
 * Le dépôt d'un rush, en tête de sa fiche (plan Publicité, §9 sexies).
 *
 * Le fichier part DIRECT au stockage, en plusieurs morceaux s'il est gros —
 * jusqu'à 500 Mo, sans passer par une fonction du serveur. Une fois déposé, ses
 * informations remplissent la fiche ; l'enregistrement lance la conversion.
 * Le refus d'un format ou d'une taille se dit AVANT l'envoi, pas après.
 */

const mo = (n: number) => `${(n / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
const STATUS: Record<string, string> = { "en-attente": "En attente de conversion", "en-cours": "Conversion en cours…", pret: "Prêt", echec: "Échec de la conversion" };

export function RushUploadField() {
  const url = useField<string>({ path: "original.url" });
  const pathname = useField<string>({ path: "original.pathname" });
  const filename = useField<string>({ path: "original.filename" });
  const contentType = useField<string>({ path: "original.contentType" });
  const size = useField<number>({ path: "original.size" });
  const title = useField<string>({ path: "title" });
  const status = useFormFields(([f]) => f?.["processing.status"]?.value as string | undefined);
  const poster = useFormFields(([f]) => f?.["working.posterUrl"]?.value as string | undefined);

  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const send = async (file: File) => {
    setError(null);
    const refusal = rushRefusal(file);
    if (refusal) return setError(refusal);
    setProgress(0);
    try {
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(rushPathname(file.name), file, {
        access: "public",
        contentType: file.type,
        handleUploadUrl: "/api/admin/ads/rushes/jeton",
        // Au-delà de quelques méga-octets, en morceaux envoyés en parallèle et relancés s'ils échouent.
        multipart: file.size > 8 * 1024 * 1024,
        onUploadProgress: (e) => setProgress(Math.round(e.percentage)),
      });
      url.setValue(blob.url);
      pathname.setValue(blob.pathname);
      filename.setValue(file.name);
      contentType.setValue(file.type);
      size.setValue(file.size);
      if (!title.value) title.setValue(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    } catch (e) {
      setError(`Envoi interrompu : ${(e as Error).message || "erreur inconnue"}. Réessayez.`);
    } finally {
      setProgress(null);
    }
  };

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void send(f);
  };

  const isVideo = (contentType.value ?? "").startsWith("video/");
  const uploading = progress !== null;

  return (
    <div className="ads-rush-upload">
      {url.value && !uploading ? (
        <div className="ads-rush-upload__done">
          {isVideo ? (
            <video className="ads-rush-upload__preview" src={url.value} poster={poster} controls muted playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu d'un fichier du stockage, pas une image du site.
            <img className="ads-rush-upload__preview" src={url.value} alt={title.value || "Rush"} />
          )}
          <div className="ads-rush-upload__info">
            <strong>{filename.value}</strong>
            <span>
              {isVideo ? "Vidéo" : "Image"} · {size.value ? mo(size.value) : "taille inconnue"}
            </span>
            {status && <span className={`ads-rush-upload__status ads-rush-upload__status--${status}`}>{STATUS[status] ?? status}</span>}
            <button type="button" className="tim-btn" onClick={() => input.current?.click()}>
              Remplacer le fichier…
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`ads-rush-upload__drop${over ? " ads-rush-upload__drop--over" : ""}`}
          disabled={uploading}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files);
          }}
        >
          {uploading ? (
            <>
              <strong>Envoi… {progress} %</strong>
              <span className="ads-rush-upload__bar" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${progress}%` }} />
              </span>
            </>
          ) : (
            <>
              <strong>Glissez une vidéo ou une image ici, ou cliquez pour choisir</strong>
              <span>MP4 ou MOV (iPhone compris), PNG, JPEG, WebP — 500 Mo au plus. Le fichier d&apos;origine est conservé tel quel.</span>
            </>
          )}
        </button>
      )}
      {error && <p className="ads-rush-upload__error">{error}</p>}
      <input ref={input} type="file" hidden accept={RUSH_CONTENT_TYPES.join(",")} onChange={(e) => pick(e.target.files)} />
    </div>
  );
}
