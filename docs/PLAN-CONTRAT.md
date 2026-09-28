# Contrat SaaS généré — plan

Décisions de l'utilisateur (28/09/2026) :

- **Seul TIM** crée, personnalise et envoie un contrat ; le partenaire le voit, sans le modifier.
- Un contrat est **modifiable jusqu'à sa signature**, puis **figé**. Mettre à jour le contrat d'un client
  crée une **nouvelle version** ; l'historique des contrats signés est conservé, le plus récent signé
  est **le contrat en vigueur**.
- **PDF seulement**, mise en page **aux couleurs de TIM** (pas la mise en page Word d'origine).
- **TIM contresigne après le client**, avec son propre code (signature électronique simple, comme le client).
- L'**identité juridique** du client (forme sociale, capital, ville du RCS, représentant légal et qualité)
  est **préremplie** à l'étape « Votre entreprise » de l'espace client, et **modifiable** par le client à
  cette étape.
- Annexe 2 : **prix unitaires par profil seulement** (pas de quantités ni de total).

Source : `Contrat_SaaS_TIM_MANAGEMENT_modele.pdf` (22 pages : 15 articles + 5 annexes).

## Étapes

1. ✅ **Données et modèle** — champs d'identité juridique (fiche + espace client, préremplis via INSEE
   quand possible) ; paramètres commerciaux du contrat sur la fiche (TIM) : durée d'engagement, durée
   du tarif préférentiel, frais d'intégration / offerts, territoire ; page Paramètres « Contrat » :
   identité du prestataire, IBAN/BIC, valeurs par défaut, **modèle en sections** importé du PDF.
2. ✅ **Génération du PDF** — variables remplies depuis la fiche, sections conditionnelles, mise en page
   TIM (en-tête, numérotation, tableau des tarifs) ; aperçu depuis la fiche.
3. ✅ **Contrats et historique** — collection des contrats par client (version, statut brouillon / envoyé /
   signé client / signé / remplacé, contenu figé, PDF) ; personnalisation par client (TIM) ; envoi →
   « Contrat à signer » → signature en ligne du client (circuit existant).
   Fait (28/09/2026) : collection `client-contracts` ; routes `/api/admin/contracts` (générer, détail,
   personnaliser, aperçu PDF, envoyer, reprendre en brouillon, supprimer un brouillon) ; encart
   « Contrat » dans l'onglet Signature (`ContractBox`) + éditeur plein écran par section ; le contrat
   signé revenu sur la fiche passe la version envoyée « signée par le client » (`contract-lifecycle`).
4. ✅ **Contresignature TIM** — code par e-mail à l'admin qui contresigne ; certificat avec les deux
   signatures ; le contrat devient « en vigueur », le précédent « remplacé ».

## Variables du modèle

Client : `client.denomination`, `client.formeSociale`, `client.capital`, `client.adresse`,
`client.villeRcs`, `client.numeroRcs` (depuis le SIREN), `representant.nom`, `representant.qualite`.
Commercial : `engagement.duree`, `denonciation.preavis`, `tarifs.delaiInformation`, `territoire`,
`tarifPreferentiel.duree`, `licences.tableau` (prix unitaires, remise déduite), `prelevement.jour`,
`integration.montant` / `integration.offerte`.
Prestataire (Paramètres) : `prestataire.*`, `banque.iban`, `banque.bic`.
