"use client";

import { useConfig, useDocumentInfo, useForm, useLocale, useModal } from "@payloadcms/ui";
import { useState } from "react";

import { docSubmitAction } from "@/modules/partner/lib/format";

import { LossReasonModal } from "./LossReasonModal";

/** Slug partagé entre le menu d'archivage et ce modal. */
export const ARCHIVE_MODAL_SLUG = "tim-archive-client";

/**
 * Archivage d'un client depuis le menu 3-points.
 *
 * Rendu en `beforeDocumentControls` pour rester monté quand le menu se referme :
 * un modal déclenché par un élément de menu disparaîtrait avec lui.
 *
 * Il ne dessine plus son propre écran : il ouvre celui de la CLÔTURE
 * (LossReasonModal), le même que le Kanban et le champ « Statut ». Archiver,
 * c'est fermer une opportunité — et depuis l'ajout du motif obligatoire, un
 * écran qui ne le demanderait pas produirait un refus du serveur au moment de
 * l'enregistrement, sans que personne comprenne pourquoi.
 */
export function ArchiveClientModal() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { id, collectionSlug } = useDocumentInfo();
  const { code: locale } = useLocale();
  const { submit } = useForm();
  const { closeModal, isModalOpen } = useModal();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!id || !isModalOpen(ARCHIVE_MODAL_SLUG)) return null;

  return (
    <LossReasonModal
      status="archive"
      busy={busy}
      error={error}
      onCancel={() => closeModal(ARCHIVE_MODAL_SLUG)}
      onConfirm={async (outcome) => {
        setBusy(true);
        setError(null);
        try {
          const { action, method } = docSubmitAction({ api, collectionSlug, id, locale, draft: true });
          await submit({
            action,
            method,
            overrides: {
              _status: "draft",
              clientStatus: "archive",
              resiliationDate: outcome.endDate,
              lossReason: outcome.reason,
              lossReasonDetail: outcome.detail || null,
            },
            skipValidation: true,
          });
          closeModal(ARCHIVE_MODAL_SLUG);
        } catch (e) {
          setError((e as Error).message || "Archivage impossible.");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
