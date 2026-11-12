/**
 * QUI FAIT SA VEILLE, ET SUR QUOI (ai-team/lib/veille) — à part, pour que la
 * page, la revue et la conversation lisent la liste sans charger le moteur de
 * veille. L'ordre est celui du dimanche soir.
 */
export const VEILLE_DOMAINS: Record<string, { channel: "google" | "chatgpt" | "meta" | null; title: string; focus: string }> = {
  "sea-google": {
    channel: "google",
    title: "Méthode Google Ads",
    focus:
      "Google Ads pour un éditeur de logiciel B2B en France : structure de compte et correspondances, mots-clés négatifs, enchères quand on a peu de conversions, suivi des leads qualifiés jusqu'à Google (conversions hors ligne), niveau de qualité et pages d'atterrissage, nouveautés de la plateforme et de son API.",
  },
  "sea-chatgpt": {
    channel: "chatgpt",
    title: "Méthode ChatGPT Ads",
    focus:
      "ChatGPT Ads (les annonces d'OpenAI dans ChatGPT) : comment la diffusion choisit les conversations, formats et rédaction des annonces, ciblage, pixel et conversions, retours d'annonceurs (surtout B2B), règles et nouveautés de la plateforme — elle est récente et change vite : date chaque information.",
  },
  "sea-meta": {
    channel: "meta",
    title: "Méthode Meta Ads",
    focus:
      "Meta Ads (Facebook, Instagram) pour générer des leads B2B auprès des entreprises du BTP et des artisans : créas qui marchent, formulaires instantanés ou site, campagnes Advantage+, qualité des leads, renvoi des leads qualifiés à Meta (Conversions API), nouveautés de la plateforme.",
  },
  "sea-mesure": {
    channel: null,
    title: "Méthode de mesure",
    focus:
      "Mesure et attribution des leads B2B : suivi des conversions de bout en bout (formulaire → démo → client), GA4, Conversions API de Meta, import des conversions hors ligne dans Google Ads, conversions de ChatGPT Ads, paramètres de suivi des liens, attribution multi-canal, consentement et RGPD — et ce qui change dans ces outils.",
  },
  "sea-stratege": {
    channel: "meta",
    title: "Méthode de stratégie créative",
    focus:
      "Stratégie créative des publicités Meta pour un logiciel B2B vendu aux entreprises du BTP et aux artisans : angles qui convertissent, douleurs et bénéfices qui parlent au BTP, tests d'angles, fatigue créative, ce que font les meilleurs annonceurs B2B.",
  },
  "sea-redacteur": {
    channel: "meta",
    title: "Méthode de rédaction publicitaire",
    focus:
      "Rédaction publicitaire Meta en B2B (BTP, artisans) : accroches, textes courts, titres, appels à l'action, ton, preuves, longueur selon le placement, ce qui fait cliquer puis demander une démo.",
  },
  "sea-directeur-artistique": {
    channel: "meta",
    title: "Méthode de direction artistique",
    focus:
      "Visuels et vidéos des publicités Meta en B2B : formats et ratios par placement, premières secondes d'une vidéo, contenus façon terrain (chantier, utilisateur), lisibilité mobile, tendances créatives qui performent.",
  },
  "sea-controleur": {
    channel: "meta",
    title: "Méthode de contrôle",
    focus:
      "Conformité et qualité des publicités : règles publicitaires de Meta (motifs de refus, allégations, mentions), droit français de la publicité (allégations, comparatif, RGPD), cohérence avec le produit réel de TIM, et ce qui change dans ces règles.",
  },
  "chef-sea": {
    channel: null,
    title: "Méthode de direction SEA",
    focus:
      "Direction d'une acquisition payante multi-canal pour un éditeur SaaS B2B vendu aux entreprises du BTP en France : répartir le budget entre les canaux au coût par lead qualifié, mesurer jusqu'au client signé, tester (méthode, volume minimal, durée), repères de coût par lead et de conversion du marché B2B SaaS et du BTP, ce que font les meilleures agences.",
  },
};


export const VEILLE_KEYS = Object.keys(VEILLE_DOMAINS);
