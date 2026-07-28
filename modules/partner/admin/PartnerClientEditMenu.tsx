"use client";

import { PopupList, useConfig, useDocumentInfo, useField, useForm, useLocale } from "@payloadcms/ui";

import { docSubmitAction } from "@/modules/partner/lib/format";

/**
 * Item « Archiver / Désarchiver » ajouté au menu 3-points natif du document
 * (editMenuItems ; visible en édition). Passe le statut client en « archivé ».
 */
export function PartnerClientEditMenu() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { id, collectionSlug } = useDocumentInfo();
  const { code: locale } = useLocale();
  const { submit } = useForm();
  const status = useField<string>({ path: "clientStatus" });

  if (!id) return null; // uniquement sur un client déjà enregistré

  const archived = status.value === "archive";
  const toggleArchive = async () => {
    const { action, method } = docSubmitAction({ api, collectionSlug, id, locale, draft: true });
    await submit({
      action,
      method,
      overrides: { _status: "draft", clientStatus: archived ? "actif" : "archive" },
      skipValidation: true,
    });
  };

  return (
    <PopupList.Button onClick={() => void toggleArchive()}>
      {archived ? "Désarchiver le client" : "Archiver le client"}
    </PopupList.Button>
  );
}
