"use client";

import { toast, useDocumentInfo, useField } from "@payloadcms/ui";
import { useState } from "react";

/**
 * « Ouvrir un espace client » sur un prospect, SANS enclencher de phase de test.
 *
 * L'espace client et le dossier de démarrage n'apparaissaient qu'à partir du
 * statut « En test » : pour faire essayer le produit à un prospect — créer des
 * accès, saisir ses chantiers —, il fallait donc lui déclencher une phase de
 * test, c'est-à-dire une séquence de mails sur quatre semaines. Beaucoup trop
 * pour un essai.
 *
 * Ce bouton n'ouvre QUE les écrans. Aucun mail ne part : l'invitation à
 * l'espace passe par le parcours, qui n'existe pas ici, et elle s'envoie
 * ensuite à la demande depuis l'encart de l'onglet.
 *
 * Il n'y a pas de geste inverse. Refermer masquerait des écrans qui portent
 * désormais des données — des accès, des chantiers — sans les supprimer : on
 * les croirait perdus. Un espace ouvert par erreur ne coûte que deux onglets.
 */
export const OpenPortalButton = () => {
  const { id } = useDocumentInfo();
  const { setValue, value } = useField<boolean>({ path: "portalOpened" });
  const [busy, setBusy] = useState(false);

  // Déjà ouvert, ou fiche pas encore enregistrée : rien à proposer. (La
  // condition du champ masque déjà le bouton dès qu'une phase de test existe.)
  if (value === true || id == null) return null;

  const open = async () => {
    setBusy(true);
    try {
      /**
       * Enregistré tout de suite côté serveur, ET posé dans le formulaire.
       *
       * Le premier parce que la suite du travail — créer un accès, saisir un
       * chantier — écrit dans d'autres collections : si l'ouverture attendait
       * un « Sauvegarder » qu'on oublie, on retrouverait une fiche sans ses
       * onglets et des données qu'on ne voit plus. Le second pour que les
       * onglets apparaissent au clic, sans recharger la page.
       */
      const res = await fetch(`/payload-api/partner-clients/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalOpened: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setValue(true);
      toast.success("Espace client ouvert. Aucun e-mail n'a été envoyé.");
    } catch {
      toast.error("L'ouverture n'a pas été enregistrée. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    // Mêmes classes que l'encart « Phase de test » juste au-dessus : deux blocs
    // qui posent la même sorte de question — « qu'est-ce qu'on ouvre à ce
    // client ? » — ne doivent pas avoir deux apparences.
    <div className="field-type jr-box">
      <h4 className="jr-box__title">Espace client</h4>
      <button type="button" className="jr-btn" disabled={busy} onClick={() => void open()}>
        {busy ? "Ouverture…" : "Ouvrir un espace client"}
      </button>
    </div>
  );
};
