"use client";

import { Modal, useConfig, useDocumentInfo, useField, useForm, useLocale, useModal } from "@payloadcms/ui";
import { useState } from "react";

import { docSubmitAction } from "@/modules/partner/lib/format";

/** Slug partagé entre le menu d'archivage et ce modal. */
export const ARCHIVE_MODAL_SLUG = "tim-archive-client";

/**
 * Modal de confirmation d'archivage d'un client (rendu en `beforeDocumentControls`
 * pour rester monté même quand le menu 3-points se referme).
 *
 * Archiver = l'abonnement mensuel s'arrête → il FAUT une date de fin de contrat.
 * Le menu (PartnerClientEditMenu) archive directement si la date est déjà là ;
 * sinon il ouvre ce modal, qui demande confirmation + saisie de la date, puis
 * enregistre `clientStatus = archive` + `resiliationDate`.
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
  const { closeModal } = useModal();
  const resiliation = useField<string>({ path: "resiliationDate" });

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10)); // aujourd'hui, yyyy-mm-dd
  const [busy, setBusy] = useState(false);

  if (!id) return null;

  const confirmArchive = async () => {
    if (!date) return;
    setBusy(true);
    const iso = new Date(`${date}T00:00:00`).toISOString();
    const { action, method } = docSubmitAction({ api, collectionSlug, id, locale, draft: true });
    await submit({
      action,
      method,
      overrides: { _status: "draft", clientStatus: "archive", resiliationDate: iso },
      skipValidation: true,
    });
    resiliation.setValue(iso);
    setBusy(false);
    closeModal(ARCHIVE_MODAL_SLUG);
  };

  return (
    <Modal slug={ARCHIVE_MODAL_SLUG} className="tim-archive">
      <div className="tim-archive__panel">
        <h2 className="tim-archive__title">Archiver ce client ?</h2>
        <p className="tim-archive__text">
          L'<strong>abonnement mensuel s'arrêtera</strong>. Indiquez la <strong>date de fin de
          contrat</strong> : la commission du partenaire s'arrête à cette date.
        </p>
        <label className="tim-archive__label" htmlFor="tim-archive-date">
          Date de fin de contrat
        </label>
        <input
          id="tim-archive-date"
          type="date"
          className="tim-archive__input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className="tim-archive__actions">
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--ghost"
            onClick={() => closeModal(ARCHIVE_MODAL_SLUG)}
          >
            Annuler
          </button>
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--danger"
            disabled={busy || !date}
            onClick={() => void confirmArchive()}
          >
            {busy ? "Archivage…" : "Archiver le client"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
