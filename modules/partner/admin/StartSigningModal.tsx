"use client";

import { useAuth } from "@payloadcms/ui";
import { useState } from "react";
import { createPortal } from "react-dom";

import { hasAdminRole } from "@/core/access";
import { PRODUCTION_STEPS } from "@/modules/marketing/lib/journey";

/**
 * « En signature » : le client a dit oui, la mise en production commence.
 *
 * Le geste ouvre le parcours « Mise en production » (et clôt la phase de test
 * encore ouverte, avec la décision « contrat »). Le modal le DIT — les étapes
 * qui vont suivre — et pose la seule question qui se pose à ce moment-là :
 * faut-il envoyer au client l'accès à son espace, où il signera ?
 *
 * On ne l'invite pas d'office : on conclut parfois avant d'être prêt à lui
 * écrire. Case décochée, l'accès est créé fermé et s'envoie plus tard depuis
 * l'onglet « Signature » de la fiche. Un client passé par un test a déjà son
 * espace : la case le renvoie simplement vers sa page « Signature ».
 *
 * TIM peut aussi y cocher « Formation incluse » quand l'entreprise a pris une
 * formation : le parcours « Formation » s'ouvre avec la mise en production.
 * Case réservée à l'admin — c'est TIM qui bâtit le plan de formation.
 *
 * Rendu par PORTAIL sur <body>, habillage `tim-archive` : même famille que le
 * modal « Affaire gagnée ».
 */
export function StartSigningModal({
  companyName,
  email,
  onCancel,
  onConfirm,
}: {
  companyName?: string;
  email?: string | null;
  onCancel: () => void;
  onConfirm: (sendInvite: boolean, openTraining: boolean) => void;
}) {
  const { user } = useAuth();
  const [invite, setInvite] = useState(false);
  const [training, setTraining] = useState(false);
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="tim-archive" onClick={onCancel}>
      <div className="tim-archive__panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="tim-archive__title">
          Mise en production{companyName ? ` — ${companyName}` : ""}
        </h2>
        <p className="tim-archive__text">
          Le client continue avec TIM. Le parcours « Mise en production » s&apos;ouvre, et TIM est
          prévenu qu&apos;un devis est à rédiger. La fiche passera « Gagnée » à l&apos;activation du
          compte de production.
        </p>
        <ol className="sig-modal-steps">
          {PRODUCTION_STEPS.map((s) => (
            <li key={s.key}>{s.label}</li>
          ))}
        </ol>
        <SigningInviteChoice email={email} checked={invite} onChange={setInvite} />
        {hasAdminRole(user) && <TrainingChoice checked={training} onChange={setTraining} />}
        <div className="tim-archive__actions">
          <button type="button" className="tim-archive__btn tim-archive__btn--ghost" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--primary"
            onClick={() => onConfirm(invite, training)}
          >
            Lancer la mise en production
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** « Formation incluse » — ouvre le parcours « Formation » avec la mise en production. */
function TrainingChoice({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="sig-invite">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Formation incluse
        <span className="sig-invite__hint">
          {checked
            ? "Le parcours « Formation » s'ouvre : vous bâtirez le plan (journées, séances, participants) depuis la fiche."
            : "Payée ou offerte. Vous pourrez aussi l'ouvrir plus tard depuis la fiche."}
        </span>
      </span>
    </label>
  );
}

/**
 * « Envoyer l'accès à l'espace client maintenant ? » — partagé avec le Kanban.
 *
 * Sans adresse e-mail, pas de case : on dirait « envoyer » sans destinataire.
 */
export function SigningInviteChoice({
  email,
  checked,
  onChange,
}: {
  email?: string | null;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  if (!email) {
    return (
      <p className="sig-invite">
        <span className="sig-invite__hint">
          Ajoutez l&apos;adresse e-mail du client pour lui ouvrir son espace : il y signera son devis et
          son contrat.
        </span>
      </p>
    );
  }
  return (
    <label className="sig-invite">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        Envoyer l&apos;accès à l&apos;espace client maintenant
        <span className="sig-invite__hint">
          {checked
            ? `Un e-mail part à ${email} : il y retrouvera son devis, son contrat et ses informations de facturation.`
            : "Sinon, vous l'enverrez plus tard depuis l'onglet « Signature »."}
        </span>
      </span>
    </label>
  );
}
