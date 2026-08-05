"use client";

import { useRef, useState } from "react";

/**
 * Zone de dépôt « Cliquez ou glissez-déposez … ici » — le geste d'ajout d'image
 * commun à l'admin. Purement présentationnelle : elle remonte les fichiers
 * choisis, l'appelant décide quoi en faire (champ Payload, envoi direct…).
 *
 * Partagée par le champ upload des fiches (DirectUpload) et le drawer de mission,
 * pour que le même geste ait le même rendu partout.
 */
export default function UploadZone({
  onFiles,
  accept = "image/*",
  noun = "une image",
  multiple = false,
  busy = false,
  disabled = false,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  noun?: string;
  multiple?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const blocked = busy || disabled;

  return (
    <>
      <div
        className={`direct-upload__zone${dragging ? " is-drag" : ""}${blocked ? " is-busy" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => !blocked && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !blocked) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!blocked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!blocked && e.dataTransfer.files?.length) onFiles(Array.from(e.dataTransfer.files));
        }}
      >
        {busy ? "Envoi en cours…" : dragging ? "Déposez pour envoyer" : `Cliquez ou glissez-déposez ${noun} ici`}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        multiple={multiple}
        onChange={(e) => {
          // Copier les fichiers AVANT de réinitialiser l'input : sinon
          // `e.target.value = ""` vide la FileList et l'upload ne part pas.
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
