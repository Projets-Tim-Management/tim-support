"use client";

// L'infobulle générique vit dans le module marketing, où elle a été écrite en
// premier. L'importer évite d'en entretenir une seconde, qui divergerait.
import { Tooltip } from "@/modules/marketing/admin/Tooltip";

/**
 * Petit « i » à côté d'un titre de statistique : au survol ET au clavier, il dit
 * comment le chiffre est calculé.
 *
 * Un graphique dont on ignore la règle de calcul se lit de travers — et personne
 * ne pose la question, on suppose.
 */
export function InfoTip({ content }: { content: string[] }) {
  return (
    <Tooltip content={content} className="acq-info">
      <span className="acq-info__dot" tabIndex={0} role="button" aria-label={content.join(". ")}>
        i
      </span>
    </Tooltip>
  );
}
