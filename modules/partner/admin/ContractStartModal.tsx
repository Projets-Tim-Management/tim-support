"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/**
 * Demande la DATE DE DÉBUT DE CONTRAT au moment où une affaire passe « Gagnée ».
 *
 * C'est cette date qui enclenche le calcul des licences mensuelles : la
 * collecter ici, dans le geste qui gagne l'affaire, évite une fiche « Gagnée »
 * à zéro euro dont personne ne comprend pourquoi elle ne rapporte rien (et un
 * refus du serveur, cf. requireContractStart).
 *
 * Rendu par PORTAIL sur <body> : le champ « Statut » vit dans le formulaire,
 * parfois lui-même dans un drawer — à l'intérieur, l'overlay resterait prisonnier
 * du contexte d'empilement. Réutilise l'habillage `tim-archive` (même famille de
 * modal de confirmation).
 *
 * Il pose aussi la question de l'ESPACE CLIENT : le client en a besoin pour
 * signer (devis, contrat, informations de facturation). On ne l'invite pas
 * d'office — on gagne parfois une affaire avant d'être prêt à lui écrire. Case
 * décochée : l'accès est créé fermé, et s'envoie plus tard depuis l'onglet
 * « Signature ».
 */
export function ContractStartModal({
  companyName,
  email,
  defaultDate,
  onCancel,
  onConfirm,
}: {
  companyName?: string;
  /** Adresse du client : c'est là que partirait l'invitation. */
  email?: string | null;
  /** Date déjà connue (ISO), proposée plutôt qu'aujourd'hui. */
  defaultDate?: string | null;
  onCancel: () => void;
  /** Reçoit la date au format ISO (début de journée locale) et le choix d'inviter. */
  onConfirm: (iso: string, sendInvite: boolean) => void;
}) {
  const [date, setDate] = useState(
    () => defaultDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  );
  const [invite, setInvite] = useState(false);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="tim-archive" onClick={onCancel}>
      <div className="tim-archive__panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="tim-archive__title">
          Affaire gagnée{companyName ? ` — ${companyName}` : ""}
        </h2>
        <p className="tim-archive__text">
          Indiquez la <strong>date de début de contrat</strong> : le calcul des licences
          mensuelles (CA et commission du partenaire) démarre à cette date. Un contrat qui
          commence plus tard ne sera compté qu'à partir de ce jour-là.
        </p>
        <label className="tim-archive__label" htmlFor="tim-contract-start">
          Date de début de contrat
        </label>
        <input
          id="tim-contract-start"
          type="date"
          className="tim-archive__input"
          value={date}
          autoFocus
          onChange={(e) => setDate(e.target.value)}
        />
        <SigningInviteChoice email={email} checked={invite} onChange={setInvite} />
        <div className="tim-archive__actions">
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--ghost"
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--primary"
            disabled={!date}
            onClick={() => onConfirm(new Date(`${date}T00:00:00`).toISOString(), invite)}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
