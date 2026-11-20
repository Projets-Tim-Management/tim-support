/**
 * LES CONSIGNES DU RÉDACTEUR D'ARTICLES (étape 5, 18/11/2026).
 *
 * Reprises MOT POUR MOT du pipeline Python (`generator.py`, `build_prompt`,
 * `rewrite_capsule`, `build_fidelity_prompt`, `_retry_message`), puis adaptées
 * aux décisions de Charlie du 18/11/2026 :
 *  - marque « TIM Management », en entier (plus « Tim Management ») ;
 *  - articles de TRAFIC : pas de TIM Management dans la TL;DR ni l'introduction,
 *    une mention au plus dans le corps, l'appel à l'action en conclusion ; seuls
 *    les articles de VENTE (BOFU, comparatifs) présentent TIM Management, avec
 *    les prix de /offres ;
 *  - « Premier mois offert, sans engagement » ET « Démarrez gratuitement » ;
 *  - FAQ de 4 à 6 questions ;
 *  - la VERSION EN VIGUEUR des règles (Éditorial › Règles des articles) est
 *    donnée au rédacteur ; le socle (partie A) est de toute façon vérifié par le code.
 *
 * Pur (testé).
 */

export const FACT_RULE =
  "Utilise UNIQUEMENT les faits du bloc FAITS VÉRIFIÉS. S'il est vide : aucun chiffre, aucune statistique, aucune attribution à un organisme, aucun cas client nommé. Une entreprise ou un témoignage ne peut être cité que s'il figure dans CAS CLIENT.";

export const NO_EXTRAPOLATION_RULE =
  "Ne jamais généraliser ou déduire une règle à partir d'un fait ; si un fait porte sur un cas précis (une caisse, une région), le présenter comme tel sans extrapoler.";

export const TLDR_NO_PROMOTION_RULE =
  "Aucun point ne promeut un outil, un logiciel, une solution ou une pratique (« le pointage digital renforce… », « un suivi centralisé sécurise… ») : la TL;DR résume les faits de l'article, jamais l'argumentaire produit. Ne mentionne pas TIM Management.";

export const COMPETITOR_RULE =
  "Un logiciel ou un éditeur concurrent peut être nommé quand c'est utile au lecteur, sans jamais de lien vers son site (ni dans le texte, ni en source), sans le recommander, et sans rien affirmer sur lui qui ne figure pas dans FAITS VÉRIFIÉS.";

export const SYSTEM_PROMPT = `Tu es un expert SEO/GEO senior et rédacteur web E-E-A-T spécialisé BTP. Tu rédiges des articles exacts et utiles, optimisés pour Google, les AI Overviews et les LLMs (ChatGPT, Perplexity, Gemini).
Tu n'inventes jamais un fait, un chiffre, une source, une entreprise ou une personne : un passage plus court mais vrai vaut toujours mieux qu'un passage étoffé par une invention.
Tu réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte avant ou après.`;

export type Intent = "tofu" | "mofu" | "bofu";

const INTENT_RULES: Record<Intent, string> = {
  tofu: "Lecteur qui découvre le sujet : définitions, explications, exemples de chantier. Aucun argumentaire produit dans le corps.",
  mofu: "Lecteur qui cherche une méthode : étapes, critères, comparaison des approches. TIM Management n'est qu'une option parmi d'autres.",
  bofu: "Lecteur qui choisit une solution : critères de choix concrets, comparaison honnête ; prix de TIM Management uniquement ceux de la GRILLE DES TARIFS ci-dessous, aucun autre prix hors FAITS VÉRIFIÉS.",
};

/** Article de vente : intention BOFU ou thématique de vente (comparatifs, choix d'un logiciel). */
export const isSalesArticle = (intent: Intent | null | undefined, themeKind: string | null | undefined) => intent === "bofu" || themeKind === "vente";

/** Les faits de référence sur TIM Management, selon que l'article est de trafic ou de vente. */
export function timReferenceRule(sales: boolean, offersGrid: string | null): string {
  const common =
    "Faits de référence sur TIM Management, seuls autorisés : « Premier mois offert, sans engagement » sur les modules payants ; « Démarrez gratuitement » avec un compte gratuit ; données hébergées en Europe. La marque s'écrit TOUJOURS « TIM Management », en entier : jamais « Tim », « TIM » seul ni « Tim Management ». Aucune note, aucun nombre d'avis, aucune étoile. Aucun pointage hors connexion, aucun mode hors ligne, aucune synchronisation au retour du réseau. Une fonctionnalité de TIM Management n'est citée que si elle figure sur une page produit de tim-management.co présente dans le sitemap ci-dessus, avec un lien vers cette page, sauf si elle est déjà liée dans l'article, et sans promesse de conformité, de résultat ni de chiffre (jamais « garantit », « fiabilise », « sécurise », « supprime les erreurs », « en 2 clics », « -50 % », « LA solution », « des outils comme TIM Management… »). Pour l'appel à l'action, le seul lien autorisé est https://tim-management.co/contact : jamais « demandez une démonstration » ni de lien vers une page de demande de démo.";
  if (!sales) {
    return `${common} Aucun prix, aucun tarif, aucun montant d'abonnement de TIM Management : c'est un article de TRAFIC.`;
  }
  return `${common} Prix de TIM Management : uniquement ceux de la GRILLE DES TARIFS ci-dessous, toujours « dès », HT, par mois et par entreprise, avec un lien vers https://tim-management.co/offres et la mention que le montant exact se fait sur devis ; jamais de remise par volume ni de prix par utilisateur.\nGRILLE DES TARIFS (page /offres, lue aujourd'hui) :\n${offersGrid ?? "(illisible aujourd'hui : ne cite AUCUN prix de TIM Management)"}`;
}

export type PromptInput = {
  keyword: string;
  title?: string | null;
  angle?: string | null;
  outline?: string[];
  cluster?: string | null;
  secondary?: string[];
  intent?: Intent | null;
  themeKind?: string | null;
  wordcount?: number | null;
  requiredUrls?: string[];
  related?: string[];
  sitemap: string[];
  competitors: { url: string; h2s: string[]; h3s: string[]; questions: string[] }[];
  factsBlock: string;
  clientCase?: string | null;
  offersGrid?: string | null;
  allowedOutbound: string[];
  today: string;
  rulesVersion: number;
  rulesText: string;
  /** Le top 10 de google.fr (comparateur, étape 4) : termes du sujet, questions posées, longueurs. */
  serpBrief?: SerpBrief | null;
};

export type SerpBrief = { terms: { label: string; share: number; min: number; max: number }[]; entities?: { label: string; share: number }[]; questions: string[]; medianWords: number | null; medianH2: number | null };

/**
 * Les termes du sujet et les questions posées sur Google, pour le rédacteur. Les
 * fourchettes (occurrences pour 1 000 mots) sont converties en nombre de fois pour la
 * longueur visée. Cible : couvrir le sujet comme la médiane des pages classées, JAMAIS
 * au-delà d'une fourchette (sur-optimisation). Pure (testée).
 */
export function serpBriefText(b: SerpBrief, words: number | null): string {
  const n = words || b.medianWords || 1500;
  const times = (x: number) => Math.max(1, Math.round((x * n) / 1000));
  const terms = b.terms.map((t) => `- ${t.label} : ${times(t.min)} à ${Math.max(times(t.min), times(t.max))} fois (${Math.round(t.share * 100)} % des pages)`);
  return [
    `Pages classées sur cette requête : environ ${b.medianWords ?? "?"} mots et ${b.medianH2 ?? "?"} H2 (médianes ; indication, pas un objectif).`,
    terms.length ? `Termes employés par la majorité des pages classées (pour ${n} mots). Couvre ces notions NATURELLEMENT, là où elles servent le lecteur ; ne dépasse JAMAIS le haut de la fourchette ; n'en force aucune :\n${terms.join("\n")}` : "",
    b.entities?.length ? `Organismes, textes et sigles cités par la majorité des pages classées : nomme ceux qui servent le sujet, SEULEMENT s'ils figurent dans les FAITS VÉRIFIÉS quand tu leur attribues un chiffre ou une règle :\n${b.entities.map((e) => `- ${e.label} (${Math.round(e.share * 100)} % des pages)`).join("\n")}` : "",
        b.questions.length ? `Questions que Google affiche (« Autres questions posées ») : traite celles qui relèvent du sujet dans un H2 ou la FAQ, avec une réponse vraie tirée des FAITS VÉRIFIÉS :\n${b.questions.map((q) => `- ${q}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const line = "═══════════════════════════════════════";
const section = (title: string, body: string) => `${line}\n${title}\n${line}\n${body}`;

function competitorContext(cs: PromptInput["competitors"]): string {
  const parts = cs
    .filter((c) => c.h2s.length || c.questions.length)
    .map((c, i) => `Concurrent ${i + 1} (${c.url})\n  H2s: ${c.h2s.slice(0, 6).join(" | ") || "aucun"}\n  H3s: ${c.h3s.slice(0, 8).join(" | ") || "aucun"}\n  Questions traitées: ${c.questions.slice(0, 10).join(" | ") || "aucune"}`);
  return parts.length ? parts.join("\n\n") : "Aucune donnée concurrente disponible.";
}

function planning(i: PromptInput): string {
  const lines: string[] = [];
  if (i.secondary?.length) lines.push(`MOTS-CLÉS SECONDAIRES (à couvrir naturellement dans un H2, une capsule ou la FAQ, 1 à 2 fois chacun, jamais de bourrage) : ${i.secondary.join(", ")}`);
  if (i.intent) lines.push(`INTENTION DE RECHERCHE (${i.intent.toUpperCase()}) : ${INTENT_RULES[i.intent]}`);
  if (i.requiredUrls?.length) lines.push(`LIENS INTERNES OBLIGATOIRES (page pilier et maillage prévus) : ${i.requiredUrls.join(", ")}`);
  if (i.outline?.length) lines.push(`PLAN PROPOSÉ PAR LA STRATÈGE DE CONTENU (indication, à suivre si les faits le permettent) :\n${i.outline.map((h) => `- ${h}`).join("\n")}`);
  if (i.related?.length) lines.push(`ARTICLES DÉJÀ PUBLIÉS SUR DES SUJETS VOISINS (ne pas traiter leur sujet principal : le résumer en une ou deux phrases et lier l'article) :\n${i.related.map((u) => `- ${u}`).join("\n")}`);
  return lines.join("\n") || "(aucune consigne de planification)";
}

/** Le message système du rédacteur : son rôle et la version en vigueur des règles (mise en cache entre la rédaction et sa relance). */
export function writerSystem(rulesVersion: number, rulesText: string): string {
  return `${SYSTEM_PROMPT}\n\nRÈGLES DES ARTICLES EN VIGUEUR (version ${rulesVersion}) — tu les appliques toutes ; en cas de conflit avec les consignes du message, le message l'emporte :\n<regles>\n${rulesText.replace(/<\/?regles>/g, "")}\n</regles>`;
}

/** Le message de rédaction (repris de build_prompt, adapté). */
export function buildArticlePrompt(i: PromptInput): string {
  const sales = isSalesArticle(i.intent, i.themeKind);
  const lengthRule = i.wordcount ? `environ ${i.wordcount} mots (intro, corps, conclusion et FAQ ; ±30 %), jamais de remplissage pour l'atteindre` : "celle que le sujet exige (aucune longueur idéale), sans remplissage";
  const requiredRule = i.requiredUrls?.length ? ` Liens obligatoires : ${i.requiredUrls.join(", ")}.` : "";
  const h1 = i.title
    ? `Le H1 est imposé : "${i.title}". Utilise-le tel quel dans le champ "title".`
    : "Rédige le H1 comme la question exacte que se pose le lecteur, ou la promesse exacte de l'article, avec le mot-clé. Jamais de préfixe du type « Guide complet 2026 : ».";
  const angle = i.angle ? `Angle différenciant imposé : "${i.angle}". Intègre cet angle dès l'introduction et dans les H2.` : "Identifie l'angle différenciant en te basant sur les lacunes des concurrents.";
  const timIntro = sales
    ? `4. Article de VENTE : tu peux présenter TIM Management comme une option, à côté des autres, en respectant les FAITS DE RÉFÉRENCE SUR TIM MANAGEMENT ci-dessous.`
    : `4. Article de TRAFIC : ne mentionne PAS TIM Management dans l'introduction.`;
  const timBody = sales
    ? `- TIM Management présenté comme une option parmi d'autres, comparaison honnête. Ton expert, accessible, non promotionnel.`
    : `- TIM Management : une mention au plus dans le corps, seulement là où elle aide vraiment le lecteur ; l'appel à l'action en conclusion. Ton expert, accessible, non promotionnel.`;

  return [
    `${line}\nMOT-CLÉ PRINCIPAL : "${i.keyword}" (c'est lui que l'introduction définit et que l'article cible)\nCLUSTER THÉMATIQUE : ${i.cluster || "(non précisé)"} (contexte uniquement, ne pas le traiter comme mot-clé)\nDATE DE PUBLICATION : ${i.today}\n${line}`,
    `${h1}\n${angle}`,
    section("PLANIFICATION ÉDITORIALE", planning(i)),
    section("FAITS VÉRIFIÉS (seules données factuelles autorisées)", i.factsBlock || "(aucun)"),
    section("CAS CLIENT (seul cas réel citable)", i.clientCase?.trim() || "(vide)"),
    section("SITEMAP TIM-MANAGEMENT.CO (pour maillage interne thématique)", i.sitemap.length ? i.sitemap.slice(0, 300).map((u) => `- ${u}`).join("\n") : "Aucune page disponible."),
    section("ANALYSE CONCURRENTIELLE (structure et questions uniquement)", competitorContext(i.competitors)),
    ...(i.serpBrief ? [section("TOP 10 GOOGLE.FR — TERMES ET QUESTIONS DU SUJET", serpBriefText(i.serpBrief, i.wordcount ?? null))] : []),
    section(
      "RÈGLE ABSOLUE — ZÉRO FAIT INVENTÉ",
      `${FACT_RULE} ${NO_EXTRAPOLATION_RULE}
- Chaque chiffre, pourcentage ou attribution (« selon… », « d'après… », « source : », étude, baromètre) doit reprendre un fait du bloc FAITS VÉRIFIÉS, avec sa source telle qu'indiquée.
- Aucun organisme (FFB, INSEE, CAPEB, OPPBTP, DARES…) n'est nommé s'il n'apparaît pas dans FAITS VÉRIFIÉS.
- Références légales (article L…/R…, décret, loi, convention collective) : uniquement si FAITS VÉRIFIÉS contient la ligne Légifrance, service-public ou code.travail.gouv.fr correspondante. Sinon, décris la règle sans citer de référence.
- Chiffre propre à une convention collective (contingent, majoration conventionnelle…) : uniquement s'il figure dans une ligne dont la source est le texte de la convention sur Légifrance. N'écris jamais « dans le BTP » pour une règle qui ne vaut que pour une convention : nomme la convention (ouvriers du bâtiment, travaux publics, ETAM, cadres).
- Montants en euros : uniquement ceux de FAITS VÉRIFIÉS, ou un calcul simple et explicite à partir d'eux (ex. plafond mensuel × 12, SMIC × taux). Un exemple chiffré part d'un montant de FAITS VÉRIFIÉS (SMIC, plafond…), jamais d'un salaire inventé.
- Les quantités neutres et évidentes (« 3 étapes », « une fois par semaine ») restent possibles.
- Signal d'expérience E-E-A-T : uniquement à partir de CAS CLIENT. S'il est vide, décris des situations de chantier génériques (« un conducteur de travaux qui suit plusieurs sites… ») sans nom, sans chiffre, sans résultat inventé.`,
    ),
    section(
      "ÉTAPE 1 — FAN-OUT DES SOUS-REQUÊTES",
      `Liste 5 à 8 sous-requêtes que poserait un conducteur de travaux ou un dirigeant d'entreprise BTP autour de "${i.keyword}" (champ "sous_requetes"), puis couvre chacune dans un H2 dédié. Pour chaque sous-requête, "h2" reprend EXACTEMENT le texte du H2 qui la traite.`,
    ),
    section(
      "ÉTAPE 2 — RÉDACTION (SEO + GEO)",
      `── INTRODUCTION ──
1. Commence par la TL;DR, exactement sous cette forme, SANS aucun attribut style ni autre attribut : <div class="tldr-box"><p>Points clés :</p><ul><li>…</li></ul></div> — 3 à 5 points autonomes. ${TLDR_NO_PROMOTION_RULE}
2. Définis "${i.keyword}" en une phrase claire dans les 100 premiers mots ; mot-clé dans les 50 premiers mots qui suivent la TL;DR.
3. Pose le problème du lecteur (chiffré uniquement avec FAITS VÉRIFIÉS), la promesse de l'article, puis un appel à l'action implicite.
${timIntro}

── CORPS ──
- Longueur : ${lengthRule}. Chaque section est autonome (150 à 300 mots), aucun remplissage, aucune paraphrase.
- Titres : aucun <h1> (le H1 est le champ "title") ; chaque bloc commence par son <h2> ; <h3> uniquement sous un <h2>, sans sauter de niveau.
- Au moins 60 % des H2 sont formulés en question (Comment…, À partir de combien…, Quelle différence…, Faut-il…).
- Chaque H2 est IMMÉDIATEMENT suivi d'une capsule : <p><strong>…</strong></p> de STRICTEMENT 40 à 60 mots (compte-les), réponse complète et autonome, compréhensible sans le reste de l'article, sans aucun lien à l'intérieur, qui nomme l'entité en toutes lettres (jamais « il », « elle », « ce dernier », « celui-ci »).
- La balise <strong> est réservée aux capsules (corps et FAQ) : aucun autre <strong> dans le contenu ni la FAQ.
- Format adapté à chaque section (liste, étapes numérotées, paragraphes courts de 3-4 lignes) ; un vrai <table> dès qu'il y a une comparaison ou des valeurs par cas (taux, délais, conventions).
- Apport propre, obligatoire (Google : « original, expert-led content that provides value beyond common knowledge ») : au moins un élément qu'un résumé des sources n'aurait pas, par exemple un exemple chiffré pas à pas calculé uniquement à partir de FAITS VÉRIFIÉS, une check-list ou un arbre de décision propre au chantier, le cas réel de CAS CLIENT s'il existe. Jamais d'expérience, de témoignage ni de citation d'expert inventés.
- Liens internes : 3 à 5 au total (minimum 3), URL copiées EXACTEMENT depuis le sitemap ci-dessus, dont au moins une page produit ou outil (hors /actualite/ et /contact), pages les plus proches thématiquement, ancre descriptive qui dit ce que contient la page (jamais « ici », « cliquez ici », « en savoir plus », « cet article »).${requiredRule}
- Liens sortants : uniquement vers une page précise présente dans FAITS VÉRIFIÉS, sur les domaines ${i.allowedOutbound.join(", ")} ; jamais vers une page d'accueil. Jamais d'URL inventée : en cas de doute, pas de lien.
${timBody}

── FAITS DE RÉFÉRENCE SUR TIM MANAGEMENT ──
${timReferenceRule(sales, i.offersGrid ?? null)}
${COMPETITOR_RULE}

── FAQ ──
4 à 6 vraies questions de lecteurs, distinctes des H2 (aucune question inventée pour remplir) ; chaque réponse commence par une capsule <p><strong>…</strong></p> de 40 à 60 mots, même règles que ci-dessus.

── MÉDIAS (propositions pour création manuelle) ──
- "images" : 2 ou 3 propositions de visuels ; "position_apres_h2" reprend EXACTEMENT un H2 ; "description_visuelle" décrit le visuel à créer ; "alt" est un texte alternatif descriptif.
- "video" : un titre YouTube et un script oral de 60 à 90 secondes (150 à 220 mots) reprenant les points clés, soumis aux mêmes règles factuelles.

── SEO ──
- yoast_title : mot-clé au début, 60 caractères environ au plus (au-delà, Google tronque l'affichage), unique sur le site.
- yoast_description : 155 caractères environ au plus, avec le mot-clé, qui dit ce que la page apporte ; différente du premier point de la TL;DR.`,
    ),
    section(
      "FORMAT JSON DE SORTIE (strict, sans markdown)",
      `{
  "sous_requetes": [{"requete": "Sous-requête du lecteur", "h2": "Texte exact du H2 qui la couvre"}],
  "title": "H1",
  "introduction": "<div class=\\"tldr-box\\"><p>Points clés :</p><ul><li>Point 1</li><li>Point 2</li><li>Point 3</li></ul></div><p>Définition et problème…</p><p>Promesse…</p>",
  "contenu": [
    {"acf_fc_layout": "texte", "texte": "<h2>Comment … ?</h2><p><strong>Capsule de 40 à 60 mots.</strong></p><p>Développement…</p>"}
  ],
  "conclusion": "<p>Synthèse, reprise du mot-clé, appel à l'action vers TIM Management avec un lien vers https://tim-management.co/contact.</p>",
  "faq": [{"titre": "Question longue traîne ?", "text": "<p><strong>Capsule de 40 à 60 mots.</strong> Complément éventuel.</p>"}],
  "faits_utilises": [1],
  "images": [{"position_apres_h2": "Texte exact d'un H2", "description_visuelle": "…", "alt": "…"}],
  "video": {"titre": "Titre YouTube", "script": "Script oral de 60 à 90 secondes"},
  "yoast_title": "Mot-clé au début | 60 car max",
  "yoast_description": "Promesse claire avec mot-clé | 155 car max"
}

RÈGLES DE SORTIE :
- JSON valide et parseable directement, sans markdown ni commentaire.
- "faits_utilises" : numéros [n] des FAITS VÉRIFIÉS réellement utilisés ([] si aucun).
- Un bloc "contenu" par H2 (chaque bloc commence par son <h2>).
- Ne produis AUCUN autre champ : ni "schema_org" (généré par Yoast), ni "sources", ni dates (ajoutés par le pipeline).`,
    ),
  ].join("\n\n");
}

/** La relance après un contrôle échoué (repris de _retry_message). */
export function retryMessage(errors: string[], unusedFactsBlock: string | null): string {
  const listed = errors.slice(0, 40).map((e) => `- ${e}`).join("\n");
  const more = errors.length > 40 ? `\n(+ ${errors.length - 40} autres)` : "";
  let msg = `Ta réponse a échoué à la validation automatique :\n${listed}${more}\n\nCorrige TOUS ces points et renvoie l'article complet, au même format JSON. Pour tout fait, chiffre, organisme, référence légale ou entreprise absent de FAITS VÉRIFIÉS / CAS CLIENT : supprime-le, ne le reformule pas. Pour une erreur « Fidélité au fait » : réécris la phrase pour qu'elle dise exactement ce que dit le fait, ou retire-la.`;
  if (unusedFactsBlock) {
    msg += `\n\nCes FAITS VÉRIFIÉS ne sont pas utilisés alors qu'ils peuvent servir le lecteur : intègre-les là où ils sont pertinents (et ajoute leur numéro à "faits_utilises") :\n${unusedFactsBlock}`;
  }
  return msg;
}

export const CAPSULE_SYSTEM = "Tu es un rédacteur web SEO/GEO rigoureux. Tu n'inventes jamais de fait.";

/** La réécriture d'une capsule hors normes (repris de rewrite_capsule). */
export function capsulePrompt(o: { keyword: string; context: string; problems: string[]; current: string; factsBlock: string; clientCase?: string | null; min: number; max: number }): string {
  return `Réécris cette capsule d'article (réponse snippet-ready) sur "${o.keyword}".

Contexte (titre de la section) : ${o.context}
Problèmes détectés : ${o.problems.join("; ")}
Capsule actuelle : ${o.current}

Contraintes :
- STRICTEMENT entre ${o.min} et ${o.max} mots (compte-les), une à trois phrases.
- Réponse complète et autonome, compréhensible sans le reste de l'article.
- Aucun lien, aucune balise HTML.
- L'entité est nommée en toutes lettres : jamais « il », « elle », « ce dernier », « celui-ci ».
- ${FACT_RULE} ${NO_EXTRAPOLATION_RULE}

FAITS VÉRIFIÉS :
${o.factsBlock || "(aucun)"}

CAS CLIENT :
${o.clientCase?.trim() || "(vide)"}

Réponds uniquement par le texte de la capsule, sans guillemets.`;
}

export const FIDELITY_SYSTEM =
  "Tu es un relecteur factuel et juridique exigeant. Tu compares un article aux faits vérifiés qui lui servent de source et tu ne signales que des contradictions certaines. Tu réponds UNIQUEMENT avec un objet JSON valide, sans markdown.";

/** La relecture de fidélité (reprise de build_fidelity_prompt). */
export function fidelityPrompt(factsBlock: string, articleText: string): string {
  return `Compare l'ARTICLE aux FAITS VÉRIFIÉS et signale uniquement les phrases qui :
1. contredisent un fait (sens d'une règle inversé, mauvais seuil, délai, taux, condition ou bénéficiaire) ;
2. étendent un fait au-delà de ce qu'il dit (règle d'une convention, d'une caisse, d'une région ou d'un cas particulier présentée comme générale, « dans le BTP » pour une seule convention) ;
3. présentent comme obligatoire ce que le fait présente comme facultatif, recommandé ou conditionnel, ou l'inverse.

Ne signale pas : le style, une information absente des faits, une reformulation fidèle, une phrase sans rapport avec un fait, un conseil pratique général.

Réponds : {"problemes": [{"phrase": "citation exacte de l'article", "fait": 1, "explication": "ce que dit le fait, en une phrase"}]}, avec "problemes": [] s'il n'y a rien.

FAITS VÉRIFIÉS
${factsBlock}

ARTICLE
${articleText}`;
}

export const RESEARCH_SYSTEM =
  "Tu es documentaliste juridique et social spécialisé BTP. Tu cherches et lis des sources officielles françaises, et tu ne rapportes que ce que tu as lu toi-même dans une page récupérée avec web_fetch. Tu n'inventes jamais un chiffre, une date, une référence ni une URL. Ta réponse finale est UNIQUEMENT un objet JSON valide, sans markdown.";

/** La recherche des faits (reprise de build_research_prompt). */
export function researchPrompt(o: { keyword: string; title?: string | null; secondary?: string[]; angle?: string | null; notes?: string | null; year: number; min: number; max: number }): string {
  return `Prépare la base factuelle d'un article de blog pour des dirigeants de PME du BTP, des conducteurs de travaux et des responsables paie.

MOT-CLÉ : "${o.keyword}"
TITRE PRÉVU : ${o.title || "(libre)"}
MOTS-CLÉS SECONDAIRES : ${o.secondary?.length ? o.secondary.join(", ") : "(aucun)"}
ANGLE : ${o.angle || "(libre)"}
NOTES DE L'ÉDITEUR : ${o.notes || "(aucune)"}

Méthode :
1. Cherche avec web_search, puis LIS avec web_fetch les pages les plus précises : article du Code du travail ou de la convention collective sur legifrance.gouv.fr, fiche service-public / entreprendre.service-public, page Urssaf, BOSS, code.travail.gouv.fr, caisses CIBTP, OPPBTP, INRS, CNIL… Une page d'accueil n'est jamais une source.
2. Retiens ${o.min} à ${o.max} faits utiles au lecteur : règles, conditions, délais, taux, montants, obligations, sanctions, définitions officielles. Valeurs en vigueur en ${o.year} ; si la page ne donne pas la valeur ${o.year}, ne donne pas de valeur.
3. Une référence légale (article L…, R…, D…, décret, convention collective) n'est retenue que si tu as lu le texte sur legifrance.gouv.fr ou une fiche officielle qui la cite. Un chiffre propre à une convention collective n'est retenu que lu dans le texte de la convention, et le fait nomme la convention (ouvriers du bâtiment, ETAM, cadres, travaux publics) au lieu de « dans le BTP ».
4. Rien sur TIM Management. Jamais une page du site d'un éditeur concurrent comme source. La documentation d'un éditeur de paie n'est utilisée que pour sa propre procédure (import, format de fichier) et seulement sur son domaine officiel.

Pour chaque fait :
- "fait" : une phrase en français qui dit EXACTEMENT ce que dit la page, sans généraliser ni durcir (une option reste une option, une condition reste une condition) ;
- "extrait" : un passage copié MOT POUR MOT de la page lue (20 à 60 mots, sans le modifier, sans « … »), qui contient tous les nombres du fait ;
- "source" : « Organisme, titre de la page » (ex. « Légifrance, Code du travail, article L3121-27 ») ;
- "url" : l'URL exacte de la page lue avec web_fetch ;
- "annee" : l'année de la version ou de la mise à jour de la page si elle est indiquée, sinon "".

Réponse finale : {"faits": [{"fait": "…", "extrait": "…", "source": "…", "url": "https://…", "annee": "${o.year}"}]}`;
}
