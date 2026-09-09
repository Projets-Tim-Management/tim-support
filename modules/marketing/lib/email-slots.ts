/**
 * Le TEXTE de chaque message du parcours, bloc par bloc.
 *
 * C'est la source unique : les gabarits (`emails.ts`) lisent ici, l'écran
 * d'édition affiche ces phrases dans ses champs, et la validation s'appuie sur
 * cette table pour refuser un bloc qui n'existe pas. Écrite une fois, elle ne
 * peut pas diverger — un texte amélioré ici l'est partout.
 *
 * Ce qui n'y figure pas n'est pas modifiable, et c'est délibéré : les adresses
 * des boutons (un lien retapé est un lien mort), les parties calculées (les cinq
 * visages, les badges des magasins, le code à usage unique), la mise en page et
 * la signature. On change les mots, pas la mécanique.
 *
 * Deux conventions dans les textes :
 *  - `{{variable}}` — remplacée à l'envoi. Voir `journey-vars.ts` ;
 *  - `**gras**` — mis en valeur dans la version HTML, effacé dans la version
 *    texte. Un seul texte alimente les deux, elles ne peuvent pas diverger.
 */

export type EmailSlot = {
  slot: string;
  label: string;
  /** À quoi sert ce bloc dans le message. Affiché sous le champ. */
  hint: string;
  /** Le texte livré avec le logiciel. C'est lui qu'on voit dans le champ. */
  defaut: string;
};

const s = (slot: string, label: string, hint: string, defaut: string): EmailSlot => ({
  slot,
  label,
  hint,
  defaut,
});

/**
 * L'OBJET, celui que le destinataire lit dans sa boîte.
 *
 * En premier partout : c'est ce qui décide qu'un message est ouvert ou pas, et
 * c'est la première chose qu'on vient corriger.
 *
 * ⚠️ Quatre objets CALCULENT quelque chose — le code de connexion, le nom du
 * client, la date de fin. Ils s'écrivent donc avec des variables ; les figer
 * ferait perdre l'information qui les rend utiles (un code de connexion qui se
 * lit sans ouvrir le message, un créneau qu'on rattache à son client).
 */
const objet = (defaut: string) =>
  s("objet", "Objet", "Ce que le destinataire lit dans sa boîte, avant d'ouvrir.", defaut);

const titre = (defaut: string) =>
  s("titre", "Titre", "Le grand titre en haut du message.", defaut);
const apercu = (defaut: string) =>
  s(
    "apercu",
    "Ligne d'aperçu",
    "Ce qu'on lit dans la boîte de réception avant d'ouvrir. Une phrase courte.",
    defaut,
  );
const bouton = (defaut: string) =>
  s("bouton", "Libellé du bouton", "Le texte du bouton. Son adresse ne change pas.", defaut);

export const EMAIL_SLOTS: Record<string, EmailSlot[]> = {
  "invitation-espace-client": [
    objet("Votre espace client TIM est ouvert"),
    titre("Votre espace client est ouvert"),
    apercu("Renseignez vos informations pour préparer votre phase de test."),
    s(
      "intro",
      "Introduction",
      "Ce que le client vient de recevoir, et pourquoi.",
      "Votre espace client est ouvert. C'est là que vous préparez la phase de test de **{{entreprise}}**.",
    ),
    s(
      "liste_intro",
      "Avant la liste",
      "La phrase qui annonce ce qu'il doit renseigner.",
      "Vous y renseignez, à votre rythme :",
    ),
    s(
      "encadre",
      "Encadré",
      "Le rappel mis en valeur : la connexion par code.",
      "Pas de mot de passe à retenir : vous saisissez votre adresse e-mail, un code à 6 chiffres vous est envoyé.",
    ),
    bouton("Ouvrir mon espace client"),
  ],

  "code-connexion": [
    objet("{{code}} — votre code de connexion TIM"),
    titre("Votre code de connexion"),
    apercu("Votre code est valable 15 minutes."),
    s(
      "intro",
      "Introduction",
      "La phrase avant le code.",
      "Voici votre code pour accéder à l'espace client de **{{entreprise}}**.",
    ),
    s(
      "validite",
      "Validité",
      "Durée de validité et usage unique.",
      "Il est valable **15 minutes** et ne fonctionne qu'une seule fois.",
    ),
    s(
      "securite",
      "Note de sécurité",
      "Que faire si on n'a rien demandé.",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : personne n'a pu accéder à votre espace.",
    ),
  ],

  "dossier-recu": [
    objet("Nous avons bien reçu votre dossier"),
    titre("Dossier bien reçu"),
    apercu("Nous préparons vos accès."),
    s(
      "intro",
      "Introduction",
      "L'accusé de réception.",
      "Votre dossier de démarrage nous est bien parvenu. Merci.",
    ),
    s(
      "suite",
      "La suite",
      "Ce que TIM fait maintenant, et pour quand.",
      "Nous préparons vos accès pour votre démarrage, **{{date_debut}}**. Vous les recevrez le matin même, prêts à être distribués à vos équipes.",
    ),
    s("encadre", "Encadré", "Le rappel mis en valeur.", "Rien à faire de votre côté d'ici là."),
  ],

  "relance-creneau": [
    objet("Il reste à réserver votre session de prise en main"),
    titre("Il reste à réserver votre session de prise en main"),
    apercu("45 minutes, avant le démarrage — il reste des créneaux."),
    s(
      "intro",
      "Introduction",
      "Le rappel de ce qui manque.",
      "Votre test démarre **{{date_debut}}**, et nous n'avons pas encore de créneau pour votre session de prise en main.",
    ),
    s(
      "format",
      "Le format",
      "Durée, et avec qui.",
      "**45 minutes** avec l'administrateur de votre compte, celui qui pilotera TIM au quotidien.",
    ),
    bouton("Choisir mon créneau"),
    s(
      "enjeu",
      "Ce qu'il en coûte",
      "Pourquoi ce créneau compte.",
      "Les entreprises qui font cette session démarrent dès la première semaine. Les autres passent la leur à chercher comment faire.",
    ),
  ],

  "relance-dossier": [
    objet("Votre dossier de démarrage nous manque"),
    titre("Votre dossier de démarrage nous manque"),
    apercu("Sans lui, vos accès ne seront pas prêts pour le démarrage."),
    s(
      "intro",
      "Introduction",
      "Le rappel de ce qui manque.",
      "Nous n'avons pas encore reçu votre dossier de démarrage : vos salariés, vos chantiers, et votre matériel si vous en suivez.",
    ),
    s(
      "enjeu",
      "Ce qu'il en coûte",
      "Pourquoi ce dossier bloque la suite.",
      "C'est ce qui nous permet de créer les comptes de vos équipes pour votre démarrage, **{{date_debut}}**. Sans lui, vos accès ne seront pas prêts le jour J.",
    ),
    bouton("Compléter mon dossier"),
    s(
      "note",
      "Note de bas",
      "La précision en petits caractères.",
      "Vous pouvez le remplir en plusieurs fois : chaque section s'enregistre au fur et à mesure.",
    ),
  ],

  "prise-en-main": [
    objet("45 minutes pour rendre votre équipe autonome"),
    titre("45 minutes pour rendre votre équipe autonome"),
    apercu("Choisissez votre créneau de prise en main."),
    s(
      "intro",
      "Introduction",
      "Ce qu'il reste à caler avant le démarrage.",
      "Votre phase de test démarre **{{date_debut}}**. D'ici là, une seule chose à caler : la session de prise en main, {{modalite_session}}.",
    ),
    s(
      "format",
      "Le format",
      "Durée, et avec qui.",
      "**45 minutes**, avec l'administrateur de votre compte, celui qui pilotera TIM au quotidien.",
    ),
    bouton("Choisir mon créneau"),
    s(
      "note",
      "Note de bas",
      "La précision en petits caractères.",
      "La session a lieu **avant** le démarrage : c'est une préparation, pas un rattrapage.",
    ),
  ],

  "acces-prets": [
    objet("Vos accès TIM sont prêts"),
    titre("Vos accès TIM sont prêts"),
    apercu("À imprimer ou à envoyer à vos équipes."),
    s(
      "intro",
      "Introduction",
      "Les comptes sont créés.",
      "Les comptes de **{{entreprise}}** sont créés : **{{nb_acces}} accès**. Votre phase de test commence aujourd'hui.",
    ),
    s(
      "qui_distribue",
      "Qui distribue",
      "Que c'est au client de les remettre.",
      "C'est vous qui les distribuez — vous savez mieux que nous qui doit commencer par quoi.",
    ),
    s(
      "encadre",
      "Encadré",
      "Où les trouver, et comment les remettre.",
      "Dans votre espace client, chaque personne a sa ligne : identifiant et mot de passe. Imprimez-les pour les remettre en main propre, ou envoyez à chacun les siens par e-mail.",
    ),
    bouton("Voir et distribuer mes accès"),
    s(
      "note",
      "Note de bas",
      "Pourquoi les identifiants ne sont pas dans le message.",
      "Les identifiants ne figurent pas dans CE message : ils ne s'affichent qu'une fois connecté à votre espace, d'où vous pourrez les envoyer à chacun.",
    ),
  ],

  "suivi-chantier": [
    objet("Le suivi de chantier, en 3 clics"),
    titre("Le suivi de chantier, en 3 clics"),
    apercu("La première chose à faire dans TIM."),
    s(
      "intro",
      "Introduction",
      "Le conseil d'usage du jour.",
      "Aujourd'hui, une seule chose : **créer un chantier et y affecter une équipe**. C'est la brique sur laquelle tout le reste s'appuie — sans chantier, pas de pointage.",
    ),
    bouton("Voir comment faire"),
  ],

  "check-in": [
    objet("Comment ça se passe sur le chantier ?"),
    titre("Comment ça se passe ?"),
    apercu("On prend des nouvelles, et on reste dispo."),
    s(
      "intro",
      "Introduction",
      "La prise de nouvelles.",
      "Une semaine que votre test a démarré. On voulait savoir **comment ça se passe** de votre côté.",
    ),
    s(
      "question",
      "Avant les visages",
      "La phrase qui introduit les cinq visages.",
      "Comment ça se passe de votre côté ? Un clic suffit :",
    ),
    s(
      "dispo",
      "Disponibilité",
      "Ce sur quoi TIM reste joignable.",
      "Et si vous avez besoin de nous — une fonctionnalité à revoir, une question de vos équipes, un point à caler ensemble —, on reste disponibles jusqu'à la fin du test.",
    ),
    s(
      "reponse",
      "Appel à répondre",
      "L'invitation à répondre à l'e-mail.",
      "Répondez directement à cet e-mail, on lit tout.",
    ),
  ],

  "fin-proche": [
    objet("Votre test se termine dans 5 jours"),
    titre("Votre test se termine bientôt"),
    apercu("Faisons le bilan avant l'échéance."),
    s(
      "intro",
      "Introduction",
      "L'annonce de la fin du test.",
      "Votre phase de test s'arrête **{{date_fin}}**.",
    ),
    s(
      "bilan",
      "La proposition",
      "Ce qu'on propose de faire avant la fin.",
      "Avant ça, on vous propose **30 minutes** pour faire le bilan : ce qui a marché, ce qui manque, et la suite si vous voulez continuer.",
    ),
    bouton("Choisir mon créneau de bilan"),
    s(
      "encadre",
      "Repli",
      "Ce qu'on propose si aucun créneau ne convient.",
      "Aucun créneau ne vous convient ? Répondez à cet e-mail, on trouvera un moment.",
    ),
  ],

  "dernier-jour": [
    objet("Vos accès s'arrêtent {{date_fin}}"),
    titre("Vos accès s'arrêtent bientôt"),
    apercu("Vos données sont conservées 30 jours."),
    s(
      "intro",
      "Introduction",
      "C'est le dernier jour.",
      "Les comptes de **{{entreprise}}** passent en lecture seule **{{date_fin}}**.",
    ),
    s(
      "encadre",
      "Encadré",
      "Ce qui se passe pour les données.",
      "Vos chantiers et vos pointages sont conservés **30 jours**. Au-delà, ils sont supprimés.",
    ),
  ],

  decision: [
    objet("Fin de votre test — votre décision"),
    titre("Votre décision"),
    apercu("Continuer, prolonger, ou s'arrêter."),
    s(
      "intro",
      "Introduction",
      "La question posée au client.",
      "Votre phase de test est terminée. Trois réponses possibles :",
    ),
    s(
      "encadre",
      "Encadré",
      "Le rappel mis en valeur.",
      "La troisième compte autant que les deux autres. Si TIM n'est pas le bon outil pour vous, dites-le-nous : ça nous aide plus qu'un silence poli.",
    ),
    s(
      "reponse",
      "Appel à répondre",
      "L'invitation à répondre à l'e-mail, sous les boutons.",
      "Vous préférez en parler ? Répondez simplement à cet e-mail.",
    ),
  ],

  "creneau-confirme": [
    objet("Votre session de prise en main est réservée"),
    titre("Votre session de prise en main est réservée"),
    apercu("Votre créneau est confirmé."),
    s(
      "intro",
      "Introduction",
      "La confirmation du créneau.",
      "Votre session de prise en main est confirmée.",
    ),
    s(
      "preparation",
      "Note de bas",
      "Comment déplacer le rendez-vous.",
      "Besoin de déplacer ce rendez-vous ? Répondez simplement à cet e-mail.",
    ),
  ],

  "rappel-creneau": [
    objet("Votre session de prise en main, c'est demain"),
    titre("C'est demain"),
    apercu("Votre session de prise en main a lieu demain."),
    s(
      "intro",
      "Introduction",
      "Le rappel de la veille.",
      "Votre session de prise en main a lieu **{{date_session}}**.",
    ),
    s(
      "preparation",
      "Préparation",
      "Ce qu'il faut avoir sous la main. Une ligne par point.",
      "**Pour que la séance serve à quelque chose**\nÊtre devant un ordinateur, pas seulement un téléphone.\nAvoir sous la main un chantier en cours et deux ou trois salariés à saisir.",
    ),
  ],

  "bilan-confirme": [
    objet("Votre bilan de fin de test est réservé"),
    titre("Votre bilan est réservé"),
    apercu("C'est calé."),
    s(
      "intro",
      "Introduction",
      "La confirmation du créneau.",
      "Votre bilan de fin de test est confirmé.",
    ),
    s(
      "preparation",
      "Note de bas",
      "Comment déplacer le rendez-vous.",
      "Besoin de déplacer ce rendez-vous ? Répondez simplement à cet e-mail.",
    ),
  ],

  "rappel-bilan": [
    objet("Votre bilan de fin de test, c'est demain"),
    titre("C'est demain"),
    apercu("Votre bilan de fin de test a lieu demain."),
    s(
      "intro",
      "Introduction",
      "Le rappel de la veille.",
      "Votre bilan de fin de test a lieu **{{date_bilan}}**.",
    ),
    s(
      "preparation",
      "Préparation",
      "Ce qu'il faut avoir en tête. Une ligne par point.",
      "**Pour que le bilan serve à quelque chose**\nCe qui a marché, et ce qui vous a manqué.\nQui, dans vos équipes, s'en est vraiment servi.\nCe que vous voulez faire ensuite.",
    ),
  ],

  "creneau-reserve": [
    objet("Créneau réservé — {{entreprise}}"),
    titre("Créneau réservé"),
    apercu("{{entreprise}} a choisi son horaire."),
    s(
      "intro",
      "Introduction",
      "Le client a réservé son créneau.",
      "**{{entreprise}}** a réservé sa session de prise en main.",
    ),
    s(
      "preparation",
      "Préparation",
      "Ce que le partenaire doit préparer.",
      "Le rendez-vous est dans votre agenda. Assurez-vous que **l'administrateur du compte** sera bien là : c'est lui qu'on forme, et lui qui fera tourner l'outil ensuite.",
    ),
  ],
};

/** Le texte livré pour ce bloc. Chaîne vide si le bloc n'existe pas. */
export const defaultSlotText = (key: string, slot: string): string =>
  (EMAIL_SLOTS[key] ?? []).find((entry) => entry.slot === slot)?.defaut ?? "";

/** Ce message expose-t-il ce bloc ? La validation s'appuie dessus. */
export const isKnownSlot = (key: string, slot: string): boolean =>
  (EMAIL_SLOTS[key] ?? []).some((entry) => entry.slot === slot);
