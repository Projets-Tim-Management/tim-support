"use client";

import { PopupList, useAuth, useConfig, useDocumentInfo, useField, useForm, useLocale, useModal } from "@payloadcms/ui";

import { hasAdminRole } from "@/core/access";
import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { docSubmitAction } from "@/modules/partner/lib/format";

import { ARCHIVE_MODAL_SLUG } from "./ArchiveClientModal";
import { MERGE_MODAL_SLUG } from "./MergeClientModal";

/**
 * Item « Archiver / Désarchiver » du menu 3-points natif (editMenuItems).
 *
 * Archiver arrête l'abonnement mensuel : il faut une DATE DE FIN DE CONTRAT et,
 * depuis l'ajout du motif obligatoire, la RAISON du départ. L'archivage passe
 * donc TOUJOURS par le modal de clôture (voir ArchiveClientModal) — archiver
 * d'un clic produirait un refus du serveur que personne ne saurait expliquer.
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
  const contractStart = useField<string>({ path: "contractStartDate" });
  const { user } = useAuth();

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
    openModal(ARCHIVE_MODAL_SLUG);
  };

  // Fusionner : réservé à TIM, et seulement pour un LEAD encore dans le
  // pipeline — le serveur le vérifie aussi (voir clients/[id]/merge).
  const canMerge = hasAdminRole(user) && clientStatusMeta(status.value)?.phase === "pipeline";

  return (
    <>
      <PopupList.Button onClick={onClick}>
        {archived ? "Désarchiver le client" : "Archiver le client"}
      </PopupList.Button>
      {canMerge && (
        <PopupList.Button onClick={() => openModal(MERGE_MODAL_SLUG)}>
          Fusionner dans une fiche existante…
        </PopupList.Button>
      )}
    </>
  );
}
