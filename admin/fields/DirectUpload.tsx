"use client";

import { FieldLabel, useField } from "@payloadcms/ui";
import { useEffect, useRef, useState } from "react";

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
 * Options par champ via `admin.custom` : `{ accept, noun }`.
 */

interface MediaLite {
  id: string | number;
  url?: string;
  filename?: string;
  mimeType?: string;
}

function isImage(m?: MediaLite | null): boolean {
  if (!m) return false;
  if (m.mimeType) return m.mimeType.startsWith("image/");
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(m.url ?? "");
}

async function uploadFile(file: File): Promise<MediaLite | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/payload-api/media", { method: "POST", body: fd, credentials: "include" });
  if (!res.ok) return null;
  const json = await res.json();
  return (json?.doc as MediaLite) ?? null;
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
  const custom = props?.field?.admin?.custom ?? {};
  const accept: string = custom.accept ?? "image/*";
  const noun: string = custom.noun ?? "une image";

  const { value, setValue } = useField<any>({ path });
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaLite[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

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
    const uploaded: MediaLite[] = [];
    for (const f of hasMany ? arr : [arr[0]]) {
      const doc = await uploadFile(f);
      if (doc) uploaded.push(doc);
    }
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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  };

  const removeAt = (idx: number) => {
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
    <div className="field-type direct-upload">
      {label && <FieldLabel label={label} path={path} />}

      {items.length > 0 && (
        <div className={`direct-upload__grid${hasMany ? "" : " direct-upload__grid--single"}`}>
          {items.map((m, i) => (
            <div key={`${m.id}-${i}`} className="direct-upload__thumb">
              {isImage(m) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" />
              ) : (
                <span className="direct-upload__doc" title={m.filename}>
                  <span className="direct-upload__doc-icon" aria-hidden>
                    📎
                  </span>
                  <span className="direct-upload__doc-name">{m.filename ?? "fichier"}</span>
                </span>
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

      {showZone && !readOnly && (
        <div
          className={`direct-upload__zone${dragging ? " is-drag" : ""}${busy ? " is-busy" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !busy) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {busy
            ? "Envoi en cours…"
            : dragging
              ? "Déposez pour envoyer"
              : `Cliquez ou glissez-déposez ${noun} ici`}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        multiple={hasMany}
        onChange={(e) => {
          // Copier les fichiers AVANT de réinitialiser l'input : sinon
          // `e.target.value = ""` vide la FileList et l'upload ne part pas.
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (files.length) void addFiles(files);
        }}
      />
    </div>
  );
}
