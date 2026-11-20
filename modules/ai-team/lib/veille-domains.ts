/**
 * QUI FAIT SA VEILLE, ET SUR QUOI (ai-team/lib/veille) — à part, pour que la
 * page, la revue et la conversation lisent la liste sans charger le moteur de
 * veille. L'ordre est celui du dimanche soir.
 */
/** Les trois bureaux. */
export type TeamKey = "sea" | "seo" | "com";
export type ChiefKey = "chef-sea" | "chef-seo" | "chef-com";
export type OfficeSpend = "agent" | "seo" | "commercial";
/**
 * LES TROIS BUREAUX, en UNE table (relecture du 15/11/2026 : chef, budget et équipe étaient recopiés dans la
 * conversation, le registre des dépenses, la feuille de route et la veille) : le chef de chacun et la ligne du registre
 * des dépenses IA sur laquelle il paie (chaque bureau a son budget, fixé sur la carte de son chef).
 */
export const OFFICES: Record<TeamKey, { chief: ChiefKey; spend: OfficeSpend }> = {
  sea: { chief: "chef-sea", spend: "agent" },
  seo: { chief: "chef-seo", spend: "seo" },
  com: { chief: "chef-com", spend: "commercial" },
};
const TEAM_KEYS = Object.keys(OFFICES) as TeamKey[];
/** Le bureau d'un chef (null : pas un chef). */
export const officeOfChief = (key: string): TeamKey | null => TEAM_KEYS.find((t) => OFFICES[t].chief === key) ?? null;
/** Le chef qui tient une ligne du registre des dépenses (null : une dépense hors bureau, textes ou images). */
export const chiefOfSpend = (kind: string): ChiefKey | null => TEAM_KEYS.map((t) => OFFICES[t]).find((o) => o.spend === kind)?.chief ?? null;
/** Le bureau d'un agent, par sa clé : sa veille le dit ; sinon le préfixe (« chef-com », « com-essais »…). */
export const teamOfKey = (key: string): TeamKey => VEILLE_DOMAINS[key]?.team ?? (TEAM_KEYS.find((t) => key === `chef-${t}` || key.startsWith(`${t}-`)) ?? "sea");
/** La ligne du registre des dépenses IA d'un bureau. */
export const spendKindOf = (team: TeamKey): OfficeSpend => OFFICES[team].spend;

export type VeilleDomain = {
  /** L'équipe : SEA (publicité payante, Mark), SEO (visibilité gratuite, Sergey) ou commerciale (le revenu, Jordan). */
  team: TeamKey;
  channel: "google" | "chatgpt" | "meta" | null;
  title: string;
  focus: string;
  /** Le repère du marché que sa veille cherche, et auquel la maîtrise compare ses résultats. */
  repere: string;
};

/**
 * LE SOCLE DE MÉTHODE de chaque agent (14/11/2026) : les règles de fond de son métier, tirées de ce qui marche (et de
 * ce qui est un mythe), adaptées au BTP français et à la taille de TIM. Sa veille part de ce socle et le confronte
 * chaque semaine aux nouveautés et aux chiffres de TIM ; elle ne s'en écarte que preuve à l'appui.
 */
export const SOCLES: Record<string, string[]> = {
  "chef-sea": [
    "Juger chaque canal au coût par lead QUALIFIÉ et au client signé, jamais au clic ni au formulaire.",
    "Déplacer le budget par paliers (20 % au plus par semaine), garder 10 à 15 % pour tester, ne jamais couper un canal sur une seule semaine.",
    "À faible volume (quelques leads par mois), raisonner sur 4 à 8 semaines glissantes et dire quand le volume ne permet pas de conclure.",
    "Les affaires se perdent plus souvent par indécision que face à un concurrent : la publicité doit aussi rassurer (preuves, reprise des données, prise en main).",
  ],
  "sea-meta": [
    "Meta ne voit pas ce qui se passe après le formulaire : sans renvoi des leads qualifiés (Conversions API, conversions hors ligne), l'algorithme optimise pour des formulaires, pas pour des démos.",
    "Peu de campagnes, des ensembles larges, beaucoup de créas différentes : la créa est le ciblage. Laisser l'apprentissage se faire (environ 50 conversions par semaine et par ensemble, rarement atteint : simplifier plutôt que multiplier).",
    "Formulaire instantané = volume mais qualité faible ; page du site = moins de volume mais plus qualifié : comparer au lead qualifié, pas au coût par lead.",
    "Fatigue créative : surveiller fréquence et CPM ; renouveler les angles avant que les résultats chutent.",
  ],
  "sea-google": [
    "Sur peu de conversions, enchères manuelles ou au clic maximisé avant les stratégies au coût par acquisition cible : il faut au moins 15 à 30 conversions par mois pour qu'elles apprennent.",
    "Importer les leads qualifiés et les signatures dans Google Ads (conversions hors ligne, gclid) : sinon Google optimise pour des formulaires.",
    "Mots-clés négatifs chaque semaine depuis les recherches réelles ; groupes d'annonces serrés par intention (logiciel devis BTP, planning chantier…).",
    "Les recherches de concurrents coûtent cher et convertissent peu : les isoler et les juger à part.",
  ],
  "sea-chatgpt": [
    "Plateforme jeune qui change vite : dater chaque information, ne rien tenir pour acquis plus d'un mois.",
    "Une conversion du pixel n'est pas un lead qualifié : juger le canal sur la fiche des canaux.",
    "Des annonces qui répondent à une question précise d'acheteur, dans ses mots, avec une preuve.",
  ],
  "sea-mesure": [
    "Le CRM est la vérité ; GA4 sous-compte (environ 40 % de refus des cookies en France) et la modélisation du mode consentement estime, elle ne mesure pas.",
    "Chaque lead doit arriver avec son canal (paramètres UTM, gclid, fbclid, page d'arrivée) ; un lead sans source est une fuite de mesure.",
    "Renvoyer aux régies les leads QUALIFIÉS et les signatures, pas seulement les formulaires.",
  ],
  "sea-stratege": [
    "Un angle = une douleur précise du BTP (situations de travaux en retard, devis refaits à la main, heures non pointées) et une promesse prouvée.",
    "Tester des angles vraiment différents, pas des variantes de couleur ; juger à 15 à 20 leads par angle, pas avant.",
    "Les mots exacts des clients (fiche produit) battent toute formule inventée.",
  ],
  "sea-redacteur": [
    "Accroche en une ligne, dans les mots du client, sur une douleur du chantier ; un chiffre concret plutôt qu'un adjectif.",
    "Bannir le jargon de logiciel (« solution digitale », « optimiser vos process », « tout-en-un ») ; parler chantier, devis, situations, équipes.",
    "Un seul appel à l'action clair (demander une démo), et ce qui se passe ensuite (« 30 minutes, sur vos chantiers »).",
  ],
  "sea-directeur-artistique": [
    "Les 2 premières secondes d'une vidéo décident : un vrai chantier, un vrai écran, un vrai utilisateur, sous-titré (la plupart regardent sans le son).",
    "Format vertical pour les placements mobiles, lisible sur petit écran, peu de texte sur l'image.",
    "Le contenu « terrain » et authentique bat le visuel léché en B2B artisanal.",
  ],
  "sea-controleur": [
    "Aucune promesse chiffrée sans preuve ; aucune comparaison nommée sans élément vérifiable.",
    "Règles publicitaires de Meta et de Google, droit français de la publicité, RGPD : vérifier avant de déposer.",
    "Cohérence avec le produit réel de TIM : ne jamais vendre une fonction qui n'existe pas.",
  ],
  "chef-com": [
    "Piloter au MRR signé et à sa trajectoire vers l'objectif, pas au nombre de leads ; le pipeline pondéré n'est qu'une prévision.",
    "À ce volume (quelques affaires par mois), juger sur 8 à 12 semaines glissantes et dire quand une conclusion n'est pas encore permise.",
    "Garder un client coûte bien moins cher qu'en trouver un : un point de churn pèse autant qu'une affaire signée.",
    "Chaque affaire ouverte a un propriétaire, une prochaine étape datée et une raison d'acheter maintenant ; sinon elle sort de la prévision.",
    "Le BTP a ses saisons (l'hiver et août ralentissent les décisions, la rentrée et janvier les relancent) : comparer à la même période, pas au mois d'avant.",
  ],
  "com-essais": [
    "Un essai réussi se décide AVANT de commencer : un critère de succès écrit avec le client, un vrai chantier saisi, une date de décision fixée.",
    "La première valeur doit arriver vite : la séance de prise en main dans les premiers jours, un premier usage réel sous 48 heures.",
    "Un essai sans échange depuis 3 à 5 jours ouvrés s'éteint : un geste utile (une aide, un exemple de son métier), pas « avez-vous pu tester ? ».",
    "Le bilan de fin d'essai se prépare : ce qui a été fait, ce qui reste, la proposition — et la décision demandée clairement.",
    "Prolonger un essai sans raison écrite retarde le « non » ; on prolonge pour un objectif précis et une nouvelle date.",
  ],
  "com-clients": [
    "Le départ se joue surtout dans les 90 premiers jours : une mise en route qui traîne est le premier signal.",
    "Une santé se lit sur des faits (usage, mise en route, demandes au support, paiements, interlocuteur qui change), notée vert/orange/rouge, et datée.",
    "Un client qui écrit beaucoup au support n'est pas forcément à risque ; un client qui se tait après une mise en route ratée l'est.",
    "Une remise retarde un départ, elle ne le règle pas : chercher la vraie raison et y répondre.",
    "Les clients satisfaits sont la meilleure source de leads : demander un avis, un témoignage ou un contact au bon moment (après une réussite).",
  ],
  "com-pipeline": [
    "Répondre à un nouveau lead dans l'HEURE ouvrée (le « 5 minutes » est un chiffre de 2007, mais l'heure bat déjà la plupart des concurrents) ; le téléphone d'abord pour un gérant du BTP.",
    "Une affaire stagne au-delà de 1,5 fois le temps des affaires gagnées à la même étape ; toute affaire ouverte a une prochaine étape datée.",
    "Un essai a des critères de réussite, un vrai chantier saisi dans les 48 heures et une date de décision fixée d'avance.",
    "40 à 60 % des affaires se perdent par indécision : rassurer (reprise des données, accompagnement, engagement mensuel), recommander fermement, jamais d'urgence inventée.",
    "Chaque relance apporte quelque chose (récapitulatif, vidéo du cas, réponse à l'objection) ; 5 à 8 contacts sur 2 à 3 semaines au plus, puis un dernier message de clôture.",
    "Après une perte au-delà de la démo : un appel de 15 minutes pour comprendre (les motifs saisis au CRM sont souvent faux), puis une relance douce à 3–6 mois.",
  ],
  "chef-seo": [
    "Prioriser les pages qui vendent et les requêtes en positions 4 à 30 avec des impressions ; l'exploration ne dépasse pas 20 % du temps.",
    "Le GEO repose d'abord sur le socle SEO (pages claires, indexées, citables) ; mentions de marque, avis et forums sont corrélés, pas prouvés ; llms.txt et le balisage « pour l'IA » sont sans effet démontré.",
    "Le SEO met 2 à 4 mois à produire ses effets : juger les objectifs sur leurs indicateurs avancés (positions, clics hors marque) avant les leads.",
  ],
  "seo-analyste": [
    "Suivre de la visite au client signé, source par source ; le CRM fait foi pour les leads, GA4 pour les tendances de visites.",
    "Séparer les types de pages (démo, produit, tarifs, blog) : un taux global ne veut rien dire.",
    "Une variation sur moins de 5 leads n'est pas un signal ; raisonner sur 4 à 8 semaines.",
  ],
  "seo-concurrence": [
    "Partir des ALTERNATIVES du client (Excel, papier, un autre logiciel, ne rien faire), pas seulement des concurrents nommés.",
    "Les pages « TIM ou X », « alternative à X » et les comparatifs captent une intention d'achat forte : honnêtes, datées, avec un tableau clair.",
    "Surveiller ce qui change (pages ajoutées, prix, positionnement) une fois par semaine ; s'inspirer pour faire mieux, jamais recopier.",
  ],
  "seo-contenu": [
    "Rafraîchir une page qui existe avant d'en écrire une nouvelle ; les pages qui vendent avant les articles.",
    "Un contenu « citable » répond à une question précise en tête de page, avec un chiffre, une source et une date — ce que reprennent Google et les IA.",
    "Les outils gratuits (calculatrices, modèles de devis, simulateurs) attirent et convertissent en B2B artisanal : les relier à la démo.",
    "Le vocabulaire du BTP et les mots des clients (fiche produit), jamais le jargon de logiciel.",
  ],
  "seo-visibilite-ia": [
    "Les IA citent ce qui est clair, factuel, récent et repris ailleurs : une page qui répond directement, des chiffres sourcés, une présence sur les comparateurs et sites que les IA lisent.",
    "Bing nourrit Copilot et une partie de ChatGPT : sans Bing indexé, une partie des IA ne voit pas TIM.",
    "Une IA ne répond jamais deux fois pareil : parler de tendances sur plusieurs mesures, jamais d'une réponse isolée.",
  ],
  "seo-technique": [
    "D'abord ce qui empêche d'être lu (pages non indexées, erreurs, redirections, robots bloqués), le cosmétique en dernier.",
    "Données structurées utiles (Organization, SoftwareApplication, FAQ là où elle est visible, BreadcrumbList) et valides ; pas de balisage pour une contenu absent de la page.",
    "Vitesse et Core Web Vitals sur mobile : le gérant consulte depuis le chantier.",
  ],
  "seo-autorite": [
    "Une fiche complète et des avis vrais sur les comparateurs et annuaires de logiciels que lisent les acheteurs et les IA valent mieux que dix liens douteux.",
    "Les médias, salons et fédérations du BTP (une tribune, une étude, un cas client) apportent des mentions qui durent.",
    "Jamais de faux avis, de liens achetés ni de message déguisé.",
  ],
  "seo-reseaux": [
    "Une vue ne vaut rien si personne ne vient : juger un contenu aux visites et aux démos qu'il amène.",
    "LinkedIn : les posts de personnes (le dirigeant) touchent plus que les pages ; vidéos courtes du terrain, sous-titrées.",
    "YouTube est un moteur de recherche : des vidéos qui répondent à une question (« comment faire une situation de travaux »), titrées comme on la tape.",
    "Un commentaire d'un prospect connu du CRM est un signal d'achat : le relancer passe avant tout.",
  ],
  "seo-conversion": [
    "Le levier le mieux établi : prendre rendez-vous tout de suite après le formulaire (environ deux fois plus de démos tenues).",
    "Un formulaire court mais utile : nom, e-mail, téléphone, entreprise et une question qui qualifie (métier ou effectif) ; enrichir le reste.",
    "La preuve à côté du bouton (clients du BTP, un chiffre), le téléphone visible, un prix ou une fourchette, et le mobile d'abord.",
    "À faible trafic, pas de test A/B : de grands changements, lus avant / après sur 4 à 8 semaines ; jamais la couleur d'un bouton.",
    "Juger aux démos tenues par des prospects qualifiés, pas aux formulaires remplis ; leads comptés dans le CRM, pas dans GA4.",
  ],
};

const CPL = "le coût par lead qualifié de ton canal (en €), pour un éditeur SaaS B2B — tous canaux payants pour la direction";

export const VEILLE_DOMAINS: Record<string, VeilleDomain> = {
  "sea-google": {
    team: "sea",
    repere: CPL,
    channel: "google",
    title: "Méthode Google Ads",
    focus:
      "Google Ads pour un éditeur de logiciel B2B en France : structure de compte et correspondances, mots-clés négatifs, enchères quand on a peu de conversions, suivi des leads qualifiés jusqu'à Google (conversions hors ligne), niveau de qualité et pages d'atterrissage, nouveautés de la plateforme et de son API.",
  },
  "sea-chatgpt": {
    team: "sea",
    repere: CPL,
    channel: "chatgpt",
    title: "Méthode ChatGPT Ads",
    focus:
      "ChatGPT Ads (les annonces d'OpenAI dans ChatGPT) : comment la diffusion choisit les conversations, formats et rédaction des annonces, ciblage, pixel et conversions, retours d'annonceurs (surtout B2B), règles et nouveautés de la plateforme — elle est récente et change vite : date chaque information.",
  },
  "sea-meta": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode Meta Ads",
    focus:
      "Meta Ads (Facebook, Instagram) pour générer des leads B2B auprès des entreprises du BTP et des artisans : créas qui marchent, formulaires instantanés ou site, campagnes Advantage+, qualité des leads, renvoi des leads qualifiés à Meta (Conversions API), nouveautés de la plateforme.",
  },
  "sea-mesure": {
    team: "sea",
    repere: CPL,
    channel: null,
    title: "Méthode de mesure",
    focus:
      "Mesure et attribution des leads B2B : suivi des conversions de bout en bout (formulaire → démo → client), GA4, Conversions API de Meta, import des conversions hors ligne dans Google Ads, conversions de ChatGPT Ads, paramètres de suivi des liens, attribution multi-canal, consentement et RGPD — et ce qui change dans ces outils.",
  },
  "sea-stratege": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode de stratégie créative",
    focus:
      "Stratégie créative des publicités Meta pour un logiciel B2B vendu aux entreprises du BTP et aux artisans : angles qui convertissent, douleurs et bénéfices qui parlent au BTP, tests d'angles, fatigue créative, ce que font les meilleurs annonceurs B2B.",
  },
  "sea-redacteur": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode de rédaction publicitaire",
    focus:
      "Rédaction publicitaire Meta en B2B (BTP, artisans) : accroches, textes courts, titres, appels à l'action, ton, preuves, longueur selon le placement, ce qui fait cliquer puis demander une démo.",
  },
  "sea-directeur-artistique": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode de direction artistique",
    focus:
      "Visuels et vidéos des publicités Meta en B2B : formats et ratios par placement, premières secondes d'une vidéo, contenus façon terrain (chantier, utilisateur), lisibilité mobile, tendances créatives qui performent.",
  },
  "sea-controleur": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode de contrôle",
    focus:
      "Conformité et qualité des publicités : règles publicitaires de Meta (motifs de refus, allégations, mentions), droit français de la publicité (allégations, comparatif, RGPD), cohérence avec le produit réel de TIM, et ce qui change dans ces règles.",
  },
  "chef-sea": {
    team: "sea",
    repere: CPL,
    channel: null,
    title: "Méthode de direction SEA",
    focus:
      "Direction d'une acquisition payante multi-canal pour un éditeur SaaS B2B vendu aux entreprises du BTP en France : répartir le budget entre les canaux au coût par lead qualifié, mesurer jusqu'au client signé, tester (méthode, volume minimal, durée), repères de coût par lead et de conversion du marché B2B SaaS et du BTP, ce que font les meilleures agences.",
  },
  // ─── L'équipe SEO/GEO (14/11/2026) : la même veille, chaque dimanche soir.
  "chef-seo": {
    team: "seo",
    channel: null,
    title: "Méthode de direction SEO & GEO",
    repere: "le taux de conversion d'une visite gratuite (moteurs, IA) en lead, en %, pour un éditeur SaaS B2B",
    focus:
      "Direction de la visibilité gratuite d'un éditeur SaaS B2B vendu aux entreprises du BTP en France : ce qui change dans Google (mises à jour du cœur, AI Overviews, AI Mode, Discover) et dans la recherche par IA (ChatGPT, Perplexity, Gemini, Copilot), comment les meilleures agences SEO/GEO priorisent et mesurent jusqu'au lead qualifié, repères de trafic et de conversion organique B2B, ce qui marche aux États-Unis et arrive en France.",
  },
  "seo-analyste": {
    team: "seo",
    channel: null,
    title: "Méthode d'analyse de bout en bout",
    repere: "le taux de conversion d'une visite gratuite (moteurs, IA) en lead, en %, pour un éditeur SaaS B2B",
    focus:
      "Analyse SEO de bout en bout : GA4 et Search Console (nouveautés, limites), attribution des visites venues des IA, suivi jusqu'au lead qualifié et au client, audit de conversion des pages B2B (formulaires, preuves, appels à l'action), repères de conversion organique SaaS B2B, ce que font les meilleures équipes en France et aux États-Unis.",
  },
  "seo-concurrence": {
    team: "seo",
    channel: null,
    title: "Méthode de veille concurrentielle",
    repere: "le taux de conversion d'une visite gratuite (moteurs, IA) en lead, en %, pour un éditeur SaaS B2B",
    focus:
      "Veille concurrentielle SEO des éditeurs de logiciels du BTP et du SaaS B2B : comment lire les mouvements d'un concurrent (pages, thèmes, comparatifs, pages « alternative à »), les formats qui gagnent en ce moment, les éditeurs BTP français et leurs équivalents américains (Procore, Buildertrend…) qui ouvrent la voie.",
  },
  "seo-contenu": {
    team: "seo",
    channel: null,
    title: "Méthode de stratégie de contenu",
    repere: "le taux de conversion d'une visite gratuite (moteurs, IA) en lead, en %, pour un éditeur SaaS B2B",
    focus:
      "Stratégie de contenu SEO et GEO pour le SaaS B2B : pages qui vendent (produit, comparatifs, alternatives, problèmes métier), rafraîchissement, contenus « citables » par les IA, E-E-A-T, ce que les mises à jour de Google récompensent ou punissent, ce qui marche aux États-Unis et en France, le vocabulaire du BTP.",
  },
  "seo-visibilite-ia": {
    team: "seo",
    channel: null,
    title: "Méthode de visibilité dans les IA (GEO)",
    repere: "la part des réponses d'IA où la marque leader d'une catégorie de logiciel B2B est nommée, en %",
    focus:
      "GEO — être recommandé par ChatGPT, Perplexity, Gemini, Copilot et Google AI Overviews / AI Mode : comment chaque IA choisit ses sources, ce qui est prouvé, corrélé ou spéculatif, études et mesures récentes (États-Unis d'abord, France ensuite), nouveautés des IA (recherche, achats, annonces), outils de mesure.",
  },
  "seo-technique": {
    team: "seo",
    channel: null,
    title: "Méthode SEO technique",
    repere: "la part des pages d'un site B2B bien tenu indexées par Google, en %",
    focus:
      "SEO technique : indexation, rendu JavaScript (Next.js), vitesse et Core Web Vitals, données structurées, robots des moteurs et des IA (GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended…), sitemaps, canoniques, ce que changent Google et les IA dans leur façon d'explorer — documentation officielle d'abord.",
  },
  "seo-autorite": {
    team: "seo",
    channel: null,
    title: "Méthode d'autorité et de relations presse",
    repere: "la part des sites de référence d'une catégorie (comparateurs, annuaires, médias) où un éditeur B2B bien installé est présent, en %",
    focus:
      "Autorité et notoriété en ligne d'un éditeur B2B : comparateurs et annuaires de logiciels (Capterra, G2, Appvizer…), avis clients, médias et salons du BTP, forums et Reddit, fiches d'entité (Wikidata, Google), relations presse numériques — ce qui fait que les moteurs et les IA citent une marque, en France et aux États-Unis. Jamais de faux avis.",
  },
  "seo-reseaux": {
    team: "seo",
    channel: null,
    title: "Méthode réseaux & vidéo",
    repere: "le taux d'interaction (interactions ÷ vues) d'un compte B2B qui performe sur YouTube, LinkedIn ou Instagram, en %",
    focus:
      "Réseaux sociaux et vidéo pour un logiciel B2B du BTP : YouTube (recherche, rétention, formats courts), LinkedIn (algorithme, posts de dirigeants, vidéos), Instagram et Facebook, contenus terrain, ce qui amène des démos et pas seulement des vues — tendances françaises et américaines, nouveautés des plateformes.",
  },
};


VEILLE_DOMAINS["chef-com"] = {
  team: "com",
  channel: null,
  title: "Méthode commerciale & revenu",
  repere: "le taux de churn mensuel d'un SaaS B2B vendu aux PME, en %",
  focus:
    "Direction commerciale d'un petit éditeur SaaS B2B vendu aux PME du BTP : prévision du revenu, revue de pipeline, croissance du MRR, rétention et expansion, organisation d'une petite équipe commerciale — ce qui marche aux États-Unis et en France.",
};
VEILLE_DOMAINS["com-pipeline"] = {
  team: "com",
  channel: null,
  title: "Méthode pipeline & relances",
  repere: "le délai médian de première réponse à un lead entrant en B2B, en heures",
  focus:
    "Pipeline commercial d'un éditeur SaaS B2B vendu sur démo aux PME du BTP : délai de réponse aux leads, relances qui apportent quelque chose, essais avec critères de réussite, affaires qui stagnent, indécision et peur de se tromper, analyse des affaires perdues — ce qui marche aux États-Unis et en France, et ce qui est un mythe.",
};
VEILLE_DOMAINS["com-essais"] = {
  team: "com",
  channel: null,
  title: "Méthode des essais",
  repere: "le taux de conversion essai → client d'un SaaS B2B avec essai accompagné, en %",
  focus:
    "Essais accompagnés d'un logiciel B2B pour PME du BTP : critères de succès, prise en main, première valeur, relances pendant l'essai, bilan et décision, prolongations — études récentes, France et États-Unis.",
};
VEILLE_DOMAINS["com-clients"] = {
  team: "com",
  channel: null,
  title: "Méthode de rétention",
  repere: "le taux de rétention du revenu (NRR) d'un SaaS B2B vendu aux PME, en %",
  focus:
    "Rétention et développement des clients d'un SaaS B2B pour PME du BTP : mise en route, santé des comptes, signaux faibles de départ, gestion des impayés, expansion (utilisateurs, modules), avis et recommandations — France et États-Unis.",
};
VEILLE_DOMAINS["seo-conversion"] = {
  team: "seo",
  channel: null,
  title: "Méthode de conversion",
  repere: "le taux de conversion visite → demande de démo d'une page démo B2B SaaS, en %",
  focus:
    "Conversion des sites B2B SaaS en demandes de démo : pages produit et tarifs, formulaires, prise de rendez-vous immédiate, preuve sociale, mobile, mesure sous consentement (CNIL, GA4), ce qu'on peut apprendre à faible trafic sans test A/B — études récentes, France et États-Unis.",
};

export const VEILLE_KEYS = Object.keys(VEILLE_DOMAINS);
/** La veille de l'équipe de Mark (sa revue, sa conversation) et celle de l'équipe de Sergey. */
export const SEA_VEILLE_KEYS = VEILLE_KEYS.filter((k) => VEILLE_DOMAINS[k].team === "sea");
export const SEO_VEILLE_KEYS = VEILLE_KEYS.filter((k) => VEILLE_DOMAINS[k].team === "seo");
export const COM_VEILLE_KEYS = VEILLE_KEYS.filter((k) => VEILLE_DOMAINS[k].team === "com");
