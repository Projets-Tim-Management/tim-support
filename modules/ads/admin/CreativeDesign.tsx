"use client";

/* eslint-disable @next/next/no-img-element -- aperçus de fichiers du CDN Blob, à leur taille réelle : next/image n'apporte rien ici. */
import { toast } from "@payloadcms/ui";
import { useRef, useState } from "react";

import { creaPathname } from "@/modules/ads/lib/creative-files";
import { checkFile, IMAGE_TYPES, parseFileName, VIDEO_TYPES, type FileFacts } from "@/modules/ads/lib/meta-specs";

import { postAdmin } from "./post-admin";

/**
 * Le brief Claude Design d'une créa, et l'import de ses fichiers finis
 * (plan Publicité, 19/10/2026).
 *
 * L'ordre suit le geste : copier le prompt, télécharger ce qu'il faut joindre,
 * créer dans Claude Design, puis glisser ici les fichiers exportés. Un fichier
 * nommé comme le brief le demande (« C12-9x16.mp4 ») se range seul ; ce que
 * Meta refuserait est dit AVANT l'envoi.
 */

export type Attachment = { name: string; url: string | null; filename: string | null };
export type CardBrief = {
  kind: string;
  formats: string[];
  durationSec: number | null;
  rationale: string | null;
  prompt: string;
  rushes: Attachment[];
  expectedFiles: string[];
};
export type CardFile = { format: string; kind: string; url: string; filename: string | null; warnings: string[] };
/** Un fichier que le brief attend : son nom à l'export, son format et sa nature. */
export type ExpectedFile = { name: string; format: string; kind: "image" | "video" };

const KIND_LABEL: Record<string, string> = { video: "Une vidéo", image: "Un visuel fixe", "les-deux": "Une vidéo et un visuel fixe" };
const FORMAT_LABEL: Record<string, string> = { "9x16": "9:16 — Stories et Reels", "4x5": "4:5 — fil d'actualité", "1x1": "1:1 — carré" };
const download = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=1`;

/** Étape 1 : de quoi créer la pub dans Claude Design — le prompt d'un clic, les fichiers à joindre, les noms à donner. */
export function StepCreate({ brief, logos }: { brief: CardBrief; logos: Attachment[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.prompt);
      setCopied(true);
      toast.success("Prompt copié : collez-le dans Claude Design.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Copie impossible : ouvrez « Voir le prompt » et sélectionnez le texte.");
    }
  };
  const attachments = [...brief.rushes, ...logos].filter((a) => a.url);
  return (
    <div className="ads-create">
      <p className="ads-create__what">
        {KIND_LABEL[brief.kind] ?? brief.kind}
        {brief.durationSec ? ` de ${brief.durationSec} s` : ""}, en {brief.formats.length} format{brief.formats.length > 1 ? "s" : ""}.
      </p>
      <div className="ads-create__row">
        <span className="ads-create__n">a</span>
        <div>
          <button type="button" className="tim-btn tim-btn--primary" onClick={copy}>
            {copied ? "Copié ✓" : "Copier le prompt"}
          </button>
          <span className="ads-create__help">puis collez-le dans un nouveau projet Claude Design.</span>
        </div>
      </div>
      {attachments.length > 0 && (
        <div className="ads-create__row">
          <span className="ads-create__n">b</span>
          <div>
            <span className="ads-create__label">Téléchargez et joignez ces fichiers :</span>
            <ul className="ads-create__files">
              {attachments.map((a) => (
                <li key={a.url!}>
                  <a href={download(a.url!)} download={a.filename ?? undefined}>
                    ↓ {a.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="ads-create__row">
        <span className="ads-create__n">{attachments.length ? "c" : "b"}</span>
        <div>
          <span className="ads-create__label">Exportez sous ces noms exacts :</span>
          <ul className="ads-create__names">
            {brief.expectedFiles.map((n) => (
              <li key={n}>
                <code>{n}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="ads-create__more">
        {brief.rationale && (
          <details>
            <summary>Pourquoi cette pub</summary>
            <p>{brief.rationale}</p>
          </details>
        )}
        <details>
          <summary>Voir le prompt</summary>
          <pre>{brief.prompt}</pre>
        </details>
      </div>
    </div>
  );
}

/** Ce que le navigateur lit d'un fichier : dimensions, et durée d'une vidéo. Null s'il ne sait pas le lire. */
async function measure(file: File): Promise<Pick<FileFacts, "width" | "height" | "durationSec"> | null> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      await new Promise<void>((ok, ko) => {
        img.onload = () => ok();
        img.onerror = () => ko(new Error("illisible"));
        img.src = url;
      });
      return { width: img.naturalWidth, height: img.naturalHeight, durationSec: null };
    }
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    await new Promise<void>((ok, ko) => {
      v.onloadedmetadata = () => ok();
      v.onerror = () => ko(new Error("illisible"));
      v.src = url;
    });
    return v.videoWidth ? { width: v.videoWidth, height: v.videoHeight, durationSec: Number.isFinite(v.duration) ? v.duration : null } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Étape 2 : les fichiers attendus, cochés à mesure qu'ils arrivent, et la zone où les glisser. */
export function StepImport({ id, files, expected, editable }: { id: number | string; files: CardFile[]; expected: ExpectedFile[]; editable: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const send = async (list: FileList | File[]) => {
    const problems: string[] = [];
    let done = 0;
    for (const file of Array.from(list)) {
      setBusy(`${file.name}…`);
      const dims = await measure(file);
      if (!dims) {
        problems.push(`${file.name} : le navigateur ne lit pas ce fichier (exportez la vidéo en MP4 H.264).`);
        continue;
      }
      const named = parseFileName(file.name);
      const facts = { mime: file.type, bytes: file.size, ...dims };
      const check = checkFile(facts, named.format);
      if (named.creative != null && String(named.creative) !== String(id)) check.problems.push(`nommé pour la créa C${named.creative}`);
      if (check.problems.length || !check.format) {
        problems.push(`${file.name} : ${check.problems.join(" ")}`);
        continue;
      }
      try {
        const { upload } = await import("@vercel/blob/client");
        const blob = await upload(creaPathname(id, check.format, file.name), file, {
          access: "public",
          contentType: file.type,
          handleUploadUrl: `/api/admin/ads/creatives/${id}/files/jeton`,
          multipart: file.size > 8 * 1024 * 1024,
          onUploadProgress: (e) => setBusy(`${file.name} — ${Math.round(e.percentage)} %`),
        });
        await postAdmin(`/api/admin/ads/creatives/${id}/files`, { url: blob.url, pathname: blob.pathname, filename: file.name, ...facts });
        done++;
      } catch (e) {
        problems.push(`${file.name} : ${(e as Error).message || "envoi interrompu"}`);
      }
    }
    setBusy(null);
    setErrors(problems);
    if (done) {
      toast.success(`${done} fichier(s) importé(s).`);
      window.location.reload();
    }
  };

  const remove = async (url: string) => {
    setBusy("Retrait…");
    try {
      const res = await fetch(`/api/admin/ads/creatives/${id}/files`, { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  const fileOf = (x: ExpectedFile) => files.find((f) => f.format === x.format && f.kind === x.kind) ?? null;
  return (
    <div className="ads-import">
      <ul className="ads-import__list">
        {expected.map((x) => {
          const f = fileOf(x);
          return (
            <li key={x.name} className={f ? "ads-import__item ads-import__item--ok" : "ads-import__item"}>
              <span className="ads-import__check" aria-hidden>
                {f ? "✓" : "○"}
              </span>
              <div className="ads-import__info">
                <code>{x.name}</code>
                <span>
                  {FORMAT_LABEL[x.format] ?? x.format} · {x.kind === "video" ? "vidéo" : "image"}
                </span>
                {f?.warnings.length ? <span className="ads-files__warn">{f.warnings.join(" ")}</span> : null}
              </div>
              {f ? (
                <div className="ads-import__thumb">
                  {f.kind === "video" ? <video src={f.url} controls muted playsInline preload="metadata" /> : <img src={f.url} alt={x.name} />}
                  {editable && (
                    <button type="button" className="ads-files__remove" disabled={busy != null} onClick={() => remove(f.url)}>
                      Retirer
                    </button>
                  )}
                </div>
              ) : (
                <em className="ads-import__wait">Attendu</em>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <button
          type="button"
          className={`ads-rush-upload__drop${over ? " ads-rush-upload__drop--over" : ""}`}
          disabled={busy != null}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void send(e.dataTransfer.files);
          }}
        >
          {busy ? (
            <strong>Import… {busy}</strong>
          ) : (
            <>
              <strong>Glissez ici les fichiers exportés, ou cliquez pour les choisir</strong>
              <span>Plusieurs à la fois. Bien nommés, ils se rangent seuls ; un nouvel import remplace l&apos;ancien.</span>
            </>
          )}
        </button>
      )}
      {errors.length > 0 && (
        <ul className="ads-files__errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" hidden multiple accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")} onChange={(e) => e.target.files && send(e.target.files)} />
    </div>
  );
}
