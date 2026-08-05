"use client";

import { useConfig, useDocumentInfo, useForm, useFormFields, useLocale } from "@payloadcms/ui";

import { docSubmitAction } from "@/modules/partner/lib/format";

/**
 * Bouton de sauvegarde intelligent (barre de contrôles, création + édition).
 * - Tous les champs requis remplis (e-mail, entreprise, partenaire) → « Publier ».
 * - Sinon → « Enregistrer le brouillon » (sans validation) + tooltip expliquant
 *   pourquoi la publication est bloquée.
 * Remplace les boutons natifs (masqués via HiddenControl).
 */
export function SmartSaveButton() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { id, collectionSlug } = useDocumentInfo();
  const { code: locale } = useLocale();
  const { submit } = useForm();

  const { email, companyName, partner } = useFormFields(([fields]) => ({
    email: fields?.email?.value,
    companyName: fields?.companyName?.value,
    partner: fields?.partner?.value,
  }));
  const canPublish = Boolean(email && companyName && partner);

  const save = async () => {
    if (canPublish) {
      const { action, method } = docSubmitAction({ api, collectionSlug, id, locale });
      await submit({ action, method, overrides: { _status: "published" } });
    } else {
      const { action, method } = docSubmitAction({ api, collectionSlug, id, locale, draft: true });
      await submit({ action, method, overrides: { _status: "draft" }, skipValidation: true });
    }
  };

  return (
    <button
      type="button"
      className={`smart-save ${canPublish ? "smart-save--publish" : "smart-save--draft"}`}
      onClick={() => void save()}
      title={
        canPublish
          ? "Enregistrer le client."
          : "Enregistrement complet impossible : renseignez les champs requis (e-mail, entreprise, partenaire). Enregistré en brouillon pour l'instant."
      }
    >
      {canPublish ? "Enregistrer" : "Enregistrer le brouillon"}
    </button>
  );
}
