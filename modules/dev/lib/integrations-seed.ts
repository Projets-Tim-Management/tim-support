/**
 * Les connexions API que le support utilise DÉJÀ, décrites d'après le code.
 *
 * Point de départ des fiches, pas une vérité figée : l'interlocuteur, le
 * compte démo et les échanges se remplissent à la main. Ce qui est écrit ici
 * — à quoi sert la connexion, ce qu'on lit et écrit — vient des modules qui
 * la font tourner, donc c'est vrai au jour du semis.
 */
export type IntegrationSeed = {
  name: string;
  kind: string;
  status: string;
  website: string;
  docUrl: string;
  summary: string;
  capabilities: string;
  links?: { url: string; label: string }[];
};

export const INTEGRATIONS_SEED: IntegrationSeed[] = [
  {
    name: "Pennylane",
    kind: "compta",
    status: "connectee",
    website: "https://www.pennylane.com",
    docUrl: "https://pennylane.readme.io/",
    summary:
      "Comptabilité et facturation de TIM Management. C'est là que vivent les clients facturés, leurs abonnements récurrents et les factures émises.\n\n" +
      "On s'y connecte pour le **rapprochement** : comparer, fiche par fiche, les licences saisies dans le support à ce que l'abonnement Pennylane facture réellement, et signer le mois.",
    capabilities:
      "**Lecture seule** (token d'entreprise, API externe v2, base `https://app.pennylane.com/api/external/v2`) :\n" +
      "- clients (`customers`) — rapprochés par SIREN, à défaut par nom ;\n" +
      "- abonnements (`subscriptions`) et leurs lignes — quantités, prix unitaires, remises, périodicité, prochaine occurrence ;\n" +
      "- factures clients (`customer_invoices`) — montants HT/TTC, échéances, état de paiement (scope `customer_invoices:readonly`).\n\n" +
      "**Pas d'écriture** : on ne crée ni ne modifie rien dans Pennylane depuis le support — les corrections se font à la main des deux côtés.\n\n" +
      "Instantané mis en cache une heure ; limite de débit à respecter (une relecture forcée par le bouton « Actualiser »).",
    links: [{ url: "https://app.pennylane.com", label: "Application" }],
  },
  {
    name: "Brevo",
    kind: "crm",
    status: "connectee",
    website: "https://www.brevo.com",
    docUrl: "https://developers.brevo.com/",
    summary:
      "Envoi et suivi des e-mails (SMTP transactionnel) et, historiquement, CRM des affaires (deals) importées dans le support.\n\n" +
      "Depuis la sortie de Brevo sur la collecte, Brevo ne sert plus qu'à **envoyer et suivre** : les formulaires du site vitrine arrivent directement dans le support.",
    capabilities:
      "- **SMTP transactionnel** : tous les e-mails du support (parcours, séquences, alertes) partent par Brevo (`BREVO_SMTP_USER` / `BREVO_SMTP_KEY`) ;\n" +
      "- **API v3** (`https://api.brevo.com/v3`, clé `BREVO_API_KEY`) : lecture des deals et de leur historique pour l'import des opportunités, désinscriptions et suppressions synchronisées avec le support ;\n" +
      "- expéditeurs à **vérifier** chez Brevo (domaine authentifié) sinon l'envoi est refusé en silence — voir docs/ADRESSES-EMAIL.md.",
    links: [{ url: "https://app.brevo.com", label: "Application" }],
  },
  {
    name: "INSEE — API Sirene",
    kind: "donnees",
    status: "connectee",
    website: "https://www.insee.fr",
    docUrl: "https://portail-api.insee.fr/",
    summary:
      "Le répertoire Sirene des entreprises françaises, par l'API de l'INSEE.\n\n" +
      "On s'y connecte pour **préremplir une fiche client** : on tape un nom ou un SIREN, l'INSEE renvoie la raison sociale, le SIREN/SIRET et l'adresse — plus de saisie à la main, plus de faute dans le SIREN qui casserait le rapprochement Pennylane.",
    capabilities:
      "- **Lecture seule**, recherche d'unités légales et d'établissements (API Sirene 3.11, en-tête `X-INSEE-Api-Key-Integration`, clé `INSEE_API_KEY`) ;\n" +
      "- passe par notre proxy `/api/insee/search` — la clé ne quitte pas le serveur ;\n" +
      "- quota de requêtes par minute : à ménager sur les recherches au clavier.",
  },
  {
    name: "Google Workspace",
    kind: "messagerie",
    status: "connectee",
    website: "https://workspace.google.com",
    docUrl: "https://developers.google.com/workspace",
    summary:
      "L'agenda et la messagerie de l'équipe et des partenaires, connectés par OAuth (comptes `@tim-management.co`).\n\n" +
      "L'**agenda** sert aux sessions de prise en main et aux bilans : le créneau réservé par le client crée l'événement (et le lien de visio) dans l'agenda du partenaire. La **boîte mail** connectée remonte les échanges avec les clients dans l'historique des opportunités.",
    capabilities:
      "- **Google Calendar** : lecture des disponibilités (agendas partagés en lecture seule inclus pour les conflits), création et mise à jour d'événements avec conférence — jetons rafraîchis chaque matin par le cron `calendar-health` ;\n" +
      "- **Gmail** : lecture des messages échangés avec l'adresse d'une opportunité (cron `mailbox-sync`), jamais d'envoi ;\n" +
      "- deux applications OAuth distinctes (`GOOGLE_CLIENT_ID` pour l'agenda, `GOOGLE_MAIL_CLIENT_ID` pour la messagerie), écran de consentement réservé au domaine.",
    links: [
      { url: "https://developers.google.com/calendar/api", label: "Doc Calendar" },
      { url: "https://developers.google.com/gmail/api", label: "Doc Gmail" },
      { url: "https://console.cloud.google.com/apis/credentials", label: "Console OAuth" },
    ],
  },
];
