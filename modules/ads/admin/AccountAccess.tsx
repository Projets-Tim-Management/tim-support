"use client";

import { toast, useDocumentInfo, useField, useFormFields } from "@payloadcms/ui";
import { useState } from "react";

import { accessVerdict } from "@/modules/ads/lib/access-verdict";

import { postAdmin } from "./post-admin";

/**
 * Fiche d'un compte › Diffusion des pubs (plan Publicité, 3b).
 *
 * « Vérifier les droits » demande à Meta ce que permet le jeton enregistré, et
 * ce qu'il ouvre ; le jeton, lui, ne quitte jamais le serveur. On choisit ici
 * la Page, le compte Instagram et le pixel au nom desquels les pubs paraissent
 * et se mesurent ; « Enregistrer » garde le choix.
 */

type Found = {
  pages?: { id: string; name: string; instagram: { id: string; username: string } | null }[];
  instagram?: { id: string; username: string }[];
  pixels?: { id: string; name: string }[];
};

function Picker({ label, idPath, namePath, options, empty }: { label: string; idPath: string; namePath: string; options: { id: string; name: string }[]; empty: string }) {
  const id = useField<string>({ path: idPath });
  const name = useField<string>({ path: namePath });
  return (
    <label className="ads-access__pick">
      <span>{label}</span>
      {options.length ? (
        <select
          value={id.value ?? ""}
          onChange={(e) => {
            const o = options.find((x) => x.id === e.target.value);
            id.setValue(o?.id ?? null);
            name.setValue(o?.name ?? null);
          }}
        >
          <option value="">— Aucun —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.id})
            </option>
          ))}
        </select>
      ) : (
        <em>{empty}</em>
      )}
    </label>
  );
}

export function AccountAccess() {
  const { id } = useDocumentInfo();
  const scopes = useFormFields(([f]) => (f["diffusion.scopes"]?.value as string[] | null) ?? null);
  const found = useFormFields(([f]) => (f["diffusion.found"]?.value as Found | null) ?? null);
  const pageId = useFormFields(([f]) => (f["diffusion.pageId"]?.value as string | null) ?? null);
  const checkedAt = useFormFields(([f]) => (f["diffusion.checkedAt"]?.value as string | null) ?? null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      await postAdmin(`/api/admin/ads/accounts/${id}/acces`);
      toast.success("Droits vérifiés chez Meta.");
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  const verdict = scopes ? accessVerdict(scopes, { pageId }) : null;
  return (
    <div className="ads-access">
      <div className="ads-access__head">
        <div>
          <strong>Publier chez Meta</strong>
          <span>{checkedAt ? `Vérifié le ${new Date(checkedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}` : "Pas encore vérifié."}</span>
        </div>
        <button type="button" className="tim-btn tim-btn--primary" disabled={busy || !id} onClick={check}>
          {busy ? "Vérification…" : "Vérifier les droits"}
        </button>
      </div>
      {verdict && (
        <p className={`ads-access__verdict ads-access__verdict--${verdict.canPublish ? "ok" : "ko"}`}>
          {verdict.canPublish ? "Prêt à publier." : verdict.problems.join(" ")}
          {verdict.helpfulMissing.length > 0 && <small> Droits utiles absents : {verdict.helpfulMissing.join(", ")}.</small>}
        </p>
      )}
      {found && (
        <div className="ads-access__picks">
          <Picker label="Page Facebook" idPath="diffusion.pageId" namePath="diffusion.pageName" options={found.pages ?? []} empty="Aucune Page accessible : assignez-la à l'utilisateur système dans le Business Manager." />
          <Picker
            label="Compte Instagram"
            idPath="diffusion.instagramId"
            namePath="diffusion.instagramName"
            options={(found.instagram ?? []).map((i) => ({ id: i.id, name: `@${i.username}` }))}
            empty="Aucun compte Instagram : les pubs Instagram paraîtront au nom de la Page."
          />
          <Picker label="Pixel (mesure des conversions)" idPath="diffusion.pixelId" namePath="diffusion.pixelName" options={found.pixels ?? []} empty="Aucun pixel : les objectifs « prospects » sur le site attendront la phase CAPI." />
        </div>
      )}
    </div>
  );
}
