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

const KIND_LABEL: Record<string, string> = { video: "Une vidéo", image: "Un visuel fixe", "les-deux": "Une vidéo et un visuel fixe" };
const download = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=1`;

export function BriefPanel({ brief, logos }: { brief: CardBrief | null; logos: Attachment[] }) {
  const [copied, setCopied] = useState(false);
  if (!brief) return <p className="ads-card__empty">Pas encore de brief Claude Design : l&apos;agent l&apos;écrit avant de déposer la créa.</p>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.prompt);
      setCopied(true);
      toast.success("Prompt copié : collez-le dans Claude Design.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Copie impossible : sélectionnez le texte du prompt à la main.");
    }
  };
  const attachments = [...brief.rushes, ...logos].filter((a) => a.url);
  return (
    <section className="ads-brief">
      <header className="ads-brief__head">
        <div>
          <strong>Brief Claude Design</strong>
          <span>
            {KIND_LABEL[brief.kind] ?? brief.kind} · {brief.formats.map((f) => f.replace("x", ":")).join(", ")}
            {brief.durationSec ? ` · ${brief.durationSec} s` : ""}
          </span>
        </div>
        <button type="button" className="tim-btn tim-btn--primary" onClick={copy}>
          {copied ? "Copié ✓" : "Copier le prompt"}
        </button>
      </header>
      {brief.rationale && <p className="ads-brief__why">{brief.rationale}</p>}
      <details className="ads-brief__prompt">
        <summary>Voir le prompt</summary>
        <pre>{brief.prompt}</pre>
      </details>
      {attachments.length > 0 && (
        <div className="ads-brief__attach">
          <span>À joindre dans Claude Design :</span>
          <ul>
            {attachments.map((a) => (
              <li key={a.url!}>
                <a href={download(a.url!)} download={a.filename ?? undefined}>
                  {a.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="ads-brief__names">
        Noms des fichiers à exporter : <code>{brief.expectedFiles.join("  ")}</code>
      </p>
    </section>
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

export function FilesPanel({ id, files, missing, editable }: { id: number | string; files: CardFile[]; missing: string[]; editable: boolean }) {
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

  return (
    <section className="ads-files">
      {files.length > 0 && (
        <div className="ads-card__visuals">
          {files.map((f) => (
            <figure key={f.url} className={`ads-shot ads-shot--${f.format}`}>
              {f.kind === "video" ? <video src={f.url} controls muted playsInline preload="metadata" /> : <img src={f.url} alt={f.filename ?? f.format} />}
              <figcaption>
                {f.format.replace("x", ":")} · {f.kind === "video" ? "vidéo" : "image"}
                {editable && (
                  <button type="button" className="ads-files__remove" disabled={busy != null} onClick={() => remove(f.url)} aria-label={`Retirer ${f.filename ?? f.format}`}>
                    Retirer
                  </button>
                )}
              </figcaption>
              {f.warnings.length > 0 && <p className="ads-files__warn">{f.warnings.join(" ")}</p>}
            </figure>
          ))}
        </div>
      )}
      {missing.length > 0 && <p className="ads-files__missing">Attendu : {missing.join(", ")}.</p>}
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
              <strong>Glissez ici les fichiers exportés de Claude Design</strong>
              <span>MP4, MOV, PNG ou JPEG — plusieurs à la fois. Nommés comme le brief le demande, ils se rangent seuls ; un réimport remplace le fichier du même format.</span>
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
    </section>
  );
}
