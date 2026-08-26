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
 * Désarchiver efface la date de fin et rend la fiche à l'état d'où elle vient :
 * « Gagnée » si un contrat avait commencé, sinon retour dans le pipeline. Une
 * opportunité archivée avant d'avoir signé n'a jamais eu de contrat — la
 * ressusciter en « Gagnée » la ferait entrer dans le CA sans qu'aucun contrat
 * n'existe (et le serveur la refuserait, cf. requireContractStart).
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
  const contractStart = useField<string>({ path: "contractStartDate" });

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
      // Désarchiver + efface la date de fin. Le statut retrouvé dépend de ce que
      // la fiche a réellement vécu (voir l'en-tête).
      void doSubmit(contractStart.value ? "actif" : "en-qualification", { resiliationDate: null });
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
