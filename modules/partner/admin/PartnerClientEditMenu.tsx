"use client";

import { PopupList, useConfig, useDocumentInfo, useField, useForm, useLocale, useModal } from "@payloadcms/ui";

import { docSubmitAction } from "@/modules/partner/lib/format";

import { ARCHIVE_MODAL_SLUG } from "./ArchiveClientModal";

/**
 * Item « Archiver / Désarchiver » du menu 3-points natif (editMenuItems).
 *
 * Archiver arrête l'abonnement mensuel → il faut une DATE DE FIN DE CONTRAT
 * (`resiliationDate`). Si elle est déjà renseignée, on archive directement ;
 * sinon on ouvre un modal de confirmation qui la demande (voir ArchiveClientModal).
 * Désarchiver repasse le client en « actif » et efface la date de fin.
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
  const { openModal } = useModal();
  const status = useField<string>({ path: "clientStatus" });
  const resiliation = useField<string>({ path: "resiliationDate" });

  if (!id) return null; // uniquement sur un client déjà enregistré

  const archived = status.value === "archive";

  const doSubmit = async (clientStatus: string, extra?: Record<string, unknown>) => {
    const { action, method } = docSubmitAction({ api, collectionSlug, id, locale, draft: true });
    await submit({
      action,
      method,
      overrides: { _status: "draft", clientStatus, ...(extra ?? {}) },
      skipValidation: true,
    });
  };

  const onClick = () => {
    if (archived) {
      void doSubmit("actif", { resiliationDate: null }); // désarchiver + efface la date de fin
      return;
    }
    if (resiliation.value) {
      void doSubmit("archive"); // date de fin déjà renseignée → archivage direct
    } else {
      openModal(ARCHIVE_MODAL_SLUG); // sinon → confirmation + saisie de la date
    }
  };

  return (
    <PopupList.Button onClick={onClick}>
      {archived ? "Désarchiver le client" : "Archiver le client"}
    </PopupList.Button>
  );
}
