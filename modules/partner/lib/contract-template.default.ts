/**
 * Le modèle de contrat LIVRÉ AVEC LE CODE — transcription fidèle du
 * « Contrat SaaS TIM MANAGEMENT » (modèle PDF de 22 pages, 28/09/2026).
 *
 * Il sème la page Paramètres → « Contrat » quand elle est vide ; ensuite, c'est
 * la version en base, modifiée par TIM, qui fait foi. Voir contract-render pour
 * la syntaxe :
 *   - paragraphes séparés par une ligne vide ; `- ` liste ; `### ` sous-titre ;
 *   - `**gras**` ; `Terme :: définition` (tableau de définitions) ;
 *   - `{{variable}}` ; `{{licences.tableau}}` et `{{signatures}}` seuls sur leur ligne ;
 *   - `[[si variable]] … [[sinon]] … [[/si]]` (passage conditionnel).
 *
 * Seules adaptations au modèle d'origine : les « [à compléter] » deviennent des
 * variables, et le bloc « Fait à … en DEUX exemplaires » devient la mention de
 * signature électronique (le contrat est signé en ligne par les deux Parties).
 */

export type ContractSection = {
  key: string;
  /** Titre affiché (« ARTICLE 4 : DURÉE DU CONTRAT »). Vide pour les parties. */
  title: string;
  /** `article` : dans le corps ; `annexe` : commence une nouvelle page. */
  kind: "preambule" | "article" | "annexe";
  body: string;
};

const PARTIES = `**Entre les soussignés :**

**LA SOCIÉTÉ {{prestataire.denomination}}**,
{{prestataire.formeSociale}},
Dont le siège social est sis {{prestataire.adresse}},
Immatriculée au Registre du Commerce et des Sociétés de {{prestataire.villeRcs}} sous le numéro {{prestataire.numeroRcs}},
Représentée par {{prestataire.representant}}, {{prestataire.qualite}}, ayant tous pouvoirs à l'effet des présentes,

>Ci-après désignée le « **Prestataire** »,
>D'une part,

**ET**

**LA SOCIÉTÉ {{client.denomination}}**,
{{client.formeSociale}}[[si client.capital]], au capital de {{client.capital}} €[[/si]],
Dont le siège social est sis {{client.adresse}},
Immatriculée au Registre du Commerce et des Sociétés de {{client.villeRcs}} sous le numéro {{client.numeroRcs}},
Représentée par {{representant.nom}}, {{representant.qualite}}, dûment habilité(e) à l'effet des présentes et pour la signature du présent contrat,

>Ci-après désignée le « **Client** »,
>D'autre part,

^Ci-après désignées ensemble les « **Parties** » et individuellement la « **Partie** ».`;

export const DEFAULT_CONTRACT_TITLE =
  "CONTRAT DE FOURNITURE DE SOLUTIONS ET DE PRESTATIONS INFORMATIQUES EN MODE SAAS";

export const DEFAULT_CONTRACT_SECTIONS: ContractSection[] = [
  { key: "parties", title: "", kind: "preambule", body: PARTIES },
  {
    key: "expose",
    title: "IL EST PRÉALABLEMENT EXPOSÉ CE QUI SUIT :",
    kind: "preambule",
    body: `Le Prestataire est une entreprise spécialisée dans l'édition de logiciels applicatifs et principalement dans la fourniture de solutions informatiques accessibles à distance, par le réseau Internet (solutions en mode SaaS).

En particulier, le Prestataire propose aux clients professionnels (ci-après le ou les « Client(s) »), un service de mise à disposition via Internet, d'une solution relative aux métiers du BTP, qu'il héberge et qu'il rend accessible à distance, ainsi que des services associés (maintenance, formation), moyennant le paiement d'un abonnement.

La solution et les services proposés ont été portés à la connaissance du Client lors des différents échanges entre les Parties.

Le Client exploite une activité de Bâtiment et/ou de Travaux publics. Il a pu déterminer que la solution et les services proposés correspondaient parfaitement à ses attentes et besoins et s'est rapproché du Prestataire afin de pouvoir en bénéficier.

Les Parties déclarent et reconnaissent que la négociation ayant précédé la conclusion du présent accord a été conduite de bonne foi et avoir bénéficié, pendant la phase précontractuelle de négociation, de toutes les informations nécessaires et utiles pour leur permettre de s'engager en toute connaissance de cause et s'être mutuellement communiquées toute information susceptible de déterminer leur consentement et qu'elles pouvaient légitimement ignorer. En particulier, le Client déclare avoir eu l'opportunité d'apprécier l'adéquation des services proposés par le Prestataire à ses besoins.`,
  },
  {
    key: "article-1",
    title: "ARTICLE 1 : DÉFINITIONS",
    kind: "article",
    body: `**CECI EXPOSÉ, IL EST CONVENU ET ARRÊTÉ CE QUI SUIT :**

Applicatifs :: désigne l'ensemble des solutions logicielles mis à disposition du Client en mode SaaS dans le cadre des Services, en ce compris l'application TIM MANAGEMENT et son Backoffice, détaillés en Annexe 1.
Contrat :: désigne le présent document et ses éventuelles annexes.
Documentation :: désigne la documentation de toute nature que le Prestataire fournit au Client, se rapportant aux Applicatifs et/ou aux Services et formalisant le référentiel des spécificités fonctionnelles des Applicatifs et des Services.
Données :: désigne l'ensemble des informations et données du Client, y compris les Données Personnelles saisies, entrées ou téléchargées automatiquement ou par l'Utilisateur Final, dans les Applicatifs et qui seront transmises et/ou stockées, hébergées ou traitées par le Prestataire dans le cadre des Services.
Données Personnelles :: désigne toutes les données qui, au sens de la législation sur la protection des données personnelles, permettent de désigner ou d'identifier, directement ou indirectement, une personne physique.
Législation relative à la protection des données :: désigne toutes lois et tous règlements en matière de protection des données personnelles et applicables à l'une ou l'autre des Parties dans le cadre du présent Contrat et notamment, le règlement général européen sur la protection des données 2016/679 (« RGPD »), ainsi que les législations nationales prises en application du RGPD, dont la Loi Informatique et Libertés du 6 janvier 1978 telle qu'amendée.
Services :: désigne l'ensemble des services que le Prestataire s'engage à fournir au Client en exécution du Contrat, notamment (i) la mise à disposition des Applicatifs en mode SaaS, (ii) l'hébergement des Applicatifs et des Données, (iii) la formation, (iv) le support et la maintenance corrective et évolutive des Applicatifs, détaillés en Annexe 3.
Utilisateur Final :: désigne toute personne habilitée par le Client à se connecter aux Applicatifs et bénéficier des Services conformément aux stipulations du Contrat.
Identifiant :: désigne le terme spécifique par lequel chaque Utilisateur Final s'identifiera pour se connecter aux Services. L'Identifiant sera accompagné d'un mot de passe propre à chaque Utilisateur Final.`,
  },
  {
    key: "article-2",
    title: "ARTICLE 2 : DOCUMENTS CONTRACTUELS",
    kind: "article",
    body: `Les relations contractuelles entre les Parties sont régies par les documents suivants, présentés par ordre hiérarchique de valeur juridique décroissant et qui constituent l'intégralité des engagements existant entre elles :

- le présent Contrat,
- l'Annexe 1 : Applicatifs,
- l'Annexe 2 : Conditions tarifaires,
- l'Annexe 3 : Niveau de Services (SLA),
- l'Annexe 4 : Sécurité,
- l'Annexe 5 : Protection des données personnelles.

Désignés ensemble le « Contrat ».`,
  },
  {
    key: "article-3",
    title: "ARTICLE 3 : OBJET DU CONTRAT",
    kind: "article",
    body: `Le présent Contrat a pour objet de définir les conditions dans lesquelles le Prestataire s'engage à mettre à la disposition du Client les Applicatifs et lui fournir les Services associés, et les conditions, y compris financières, dans lesquelles le Client peut y accéder et en bénéficier.`,
  },
  {
    key: "article-4",
    title: "ARTICLE 4 : DURÉE DU CONTRAT",
    kind: "article",
    body: `Le Contrat prend effet [[si contrat.dateDebut]]le {{contrat.dateDebut}}[[sinon]]à compter de sa signature par les deux Parties[[/si]], pour une durée initiale de {{engagement.duree}} (ci-après la « Période d'engagement »).

Il se renouvelle ensuite par tacite reconduction, pour des périodes successives d'une durée identique à la Période d'engagement, sauf dénonciation par l'une ou l'autre des Parties, signifiée par email ou par lettre recommandée avec accusé de réception, {{denonciation.preavis}} au moins avant l'échéance de la période en cours.

Toute période commencée est due dans son intégralité. En cas de dénonciation, le Client demeure redevable des sommes dues jusqu'au terme de la période en cours.

À chaque renouvellement, le Prestataire pourra réviser ses conditions tarifaires, sous réserve d'en informer le Client par écrit au moins {{tarifs.delaiInformation}} avant l'expiration du délai de dénonciation visé ci-dessus. À défaut de dénonciation par le Client dans ce délai, les nouvelles conditions tarifaires sont réputées acceptées.`,
  },
  {
    key: "article-5",
    title: "ARTICLE 5 : PRESTATIONS DE SERVICES",
    kind: "article",
    body: `### 5.1 Services fournis par le Prestataire

Le Prestataire s'engage à fournir au Client les Services ci-après définis.

Le Prestataire peut, à tout moment, modifier les Applicatifs et/ou les Services, ou changer la manière dont les Services sont fournis, s'il peut être raisonnablement supposé que cela ne cause pas de désagrément au Client, ou si cette modification améliore les Services.

### 5.1.1 Hébergement et mise à disposition d'un accès aux Applicatifs

Le Prestataire (i) héberge les Applicatifs, et (ii) en fournit l'accès et en permet l'utilisation par les Utilisateurs.

À cet effet, le Prestataire communique des codes d'accès au Client en vue de l'accès aux Applicatifs par les Utilisateurs. Chaque Utilisateur dispose d'un identifiant et d'un mot de passe qui lui sont propres comme énoncé ci-après.

Les SLA et engagements en termes de sécurité du Prestataire sont précisés en Annexes 3 et 4 du Contrat.

### 5.1.2 Formation

Dans le cadre de la mise en service des Applicatifs, le Prestataire peut assurer une prestation de formation auprès des Utilisateurs selon les modalités précisées en Annexe 3 et le prix indiqué en Annexe 2.

### 5.1.3 Maintenance

Le Prestataire assure la maintenance corrective et évolutive des Applicatifs selon les modalités précisées en Annexe 3 et le prix indiqué en Annexe 2.

Au titre de la maintenance évolutive, le Prestataire améliore, adapte et/ou modifie les Applicatifs afin qu'ils correspondent aux meilleurs standards selon l'évolution technologique et/ou réglementaire en vigueur.

Au titre de la maintenance corrective, le Prestataire fournit un service de support Utilisateurs et de résolution des bugs ou erreurs tel que précisé en Annexe 3.

Il est précisé que la maintenance ne comprend pas de développements logiciels spécifiques.

### 5.2 Accès aux Services – Disponibilité

Le Prestataire garantit un accès aux Services et une exécution de ces derniers conformément aux dispositions du SLA figurant en Annexe 3.

L'accès aux Services par les Utilisateurs s'effectue, pour chaque Utilisateur Final, à l'aide de ses Identifiants à partir de tout ordinateur fixe ou portable ou de tout appareil téléphonique mobile, même non situés dans les locaux du Client, via les systèmes Apple et Android.

Les Identifiants sont attribués individuellement à chaque Utilisateur Final par le Prestataire et un mot de passe provisoire est également communiqué par le Prestataire. Il incombe à l'Utilisateur Final de modifier ce mot de passe lors de sa première connexion.

Le Client devra veiller à faire respecter la confidentialité des Identifiants et mots de passe par ses Utilisateurs. Les identifiants et mots de passe ne peuvent être utilisés que pour permettre l'accès aux Services des Utilisateurs autorisés par le Client et ce, afin de garantir la sécurisation des Données du Client. Les identifiants et mots de passe ne peuvent être communiqués à des tiers, y compris à d'autres Utilisateurs.

En cas de perte ou de détournement d'un identifiant et mot de passe, une procédure d'attribution de nouveaux identifiants et d'un nouveau mot de passe est mise en œuvre.

Le Prestataire se réserve en toutes hypothèses le droit de procéder à la clôture ou à la suspension du compte de l'Utilisateur Final concerné, sans que sa responsabilité ne puisse être engagée au titre du Contrat.

Le Client est informé toutefois que la connexion aux Services s'effectue via le réseau Internet. Il est à ce titre averti des aléas techniques qui peuvent affecter ce réseau et entraîner des ralentissements ou des indisponibilités rendant la connexion impossible. Le Prestataire ne peut être tenu responsable des difficultés d'accès aux Services dues à des perturbations du réseau Internet.`,
  },
  {
    key: "article-6",
    title: "ARTICLE 6 : GARANTIES ET RESPONSABILITÉ DU PRESTATAIRE",
    kind: "article",
    body: `### 6.1 Garanties

Le Prestataire déclare et garantit :

- qu'il dispose de tous les moyens nécessaires (matériels, humains, disponibilité) pour exécuter ses engagements contractuels et dans le respect de la réglementation en vigueur et des règles de l'art, en particulier quant à la sécurité et l'intégrité des Données ;
- qu'il dispose de tous les droits de propriété intellectuelle permettant de conclure le Contrat et qu'à ce titre, les Services ne portent pas atteinte à des droits de tiers et ne sont pas contrefaisants. En conséquence, le Prestataire garantit le Client contre toute action en justice sérieuse en contrefaçon qui pourrait être intentée à son encontre par toute personne physique ou morale se prévalant d'un droit de propriété intellectuelle portant sur les Services, à condition toutefois (i) que le Client en informe le Prestataire sans délai, permettant ainsi au Prestataire de se défendre et/ou de faire valoir ses intérêts en justice, et (ii) que le Prestataire soit seul à diriger la défense à toute action et/ou réclamation. À ce titre, le Prestataire prendra à sa charge l'ensemble des condamnations au principal, frais et accessoires auxquels pourrait être condamné le Client par une décision de justice devenue définitive condamnant le Client pour contrefaçon.

### 6.2 Responsabilité

Le Prestataire ne pourra, en aucun cas, être tenu responsable d'un quelconque dommage indirect, de quelque nature que ce soit et notamment de perte d'exploitation ou toute autre perte financière. Par dommages indirects, on entend notamment, sans que cette liste soit limitative, les pertes de gains ou de profits, perte de chance, dommages commerciaux, les conséquences de plaintes ou réclamations de tiers contre le Client, à l'exception toutefois des dispositions de l'article 6.1 du Contrat.

**EN TOUTE HYPOTHÈSE, LE CLIENT ACCEPTE QUE LA RESPONSABILITÉ DU PRESTATAIRE EST LIMITÉE, TOUS DOMMAGES CONFONDUS, À L'EXCEPTION DES DOMMAGES CORPORELS ET/OU RÉSULTANT D'UN DOL OU D'UNE FAUTE LOURDE, À UN MONTANT ÉQUIVALENT AUX SOMMES EFFECTIVEMENT PAYÉES PAR LE CLIENT AU TITRE DU CONTRAT AU COURS DES SIX (6) MOIS PRÉCÉDANT LE FAIT GÉNÉRATEUR DE RESPONSABILITÉ.**

Le Prestataire ne fait aucune autre garantie expresse ou implicite relativement aux Services, y compris, notamment : (i) garantie implicite de qualité marchande ou d'adéquation des Applicatifs à un objectif particulier et (ii) garantie de résultat des Services. En outre, les Parties reconnaissent qu'un logiciel peut contenir des erreurs et que toutes les erreurs ne sont pas économiquement rectifiables ou qu'il n'est pas toujours nécessaire de les corriger. En conséquence, le Prestataire ne garantit pas que l'ensemble des défaillances ou erreurs des Applicatifs seront corrigées.`,
  },
  {
    key: "article-7",
    title: "ARTICLE 7 : CONDITIONS D'UTILISATION – RESPONSABILITÉ DU CLIENT",
    kind: "article",
    body: `### 7.1 Droit d'utilisation des Applicatifs – Utilisation conforme

Le Prestataire concède au Client, à titre non exclusif, un droit d'accès et d'utilisation des Applicatifs et de leur Documentation, par les Utilisateurs, pour la durée du Contrat et pour le ou les pays dans lesquels le Client exploite son activité, à savoir : {{territoire}}.

Le Client est responsable de l'utilisation conforme des Applicatifs par les Utilisateurs. Le Client s'engage à utiliser les Applicatifs conformément (i) au Contrat, (ii) à la Documentation contenue en annexe du présent Contrat, en ce compris les éventuels prérequis techniques qu'elle précise et dont il reconnaît avoir pris connaissance, (iii) ainsi qu'aux termes de la licence de l'article 9.2 du Contrat.

Le Client est informé du fait que les prérequis techniques nécessaires au fonctionnement optimal des Services peuvent évoluer, notamment pour des raisons techniques. Si une évolution intervient en cours de contrat, le Client en sera informé au préalable.

### 7.2 Responsabilité du Client

Le Client est seul responsable :

- de souscrire et de maintenir l'accès au réseau Internet pour accéder aux Applicatifs. À cet égard, le Client est averti des aléas techniques inhérents à Internet et des interruptions d'accès qui peuvent en résulter. En conséquence, le Prestataire ne sera pas tenu responsable des éventuelles indisponibilités, discontinuités ou ralentissements des Services imputables à des tiers, à un dysfonctionnement du réseau Internet et/ou à un cas de force majeure ;
- de l'utilisation des Services, en particulier par les Utilisateurs. À ce titre, il lui appartient de veiller à ce que les Utilisateurs respectent le Contrat, en ce compris ses Annexes et la Documentation, ainsi que les dispositions législatives et réglementaires en vigueur, notamment au regard du contenu et des Données dont il est responsable. En conséquence, le Client garantit le Prestataire contre toute action qui pourrait être intentée à son encontre à ce titre et l'indemnise des sommes versées par lui le cas échéant. Le Client ne pourra céder, de quelque façon que ce soit, le droit d'accès aux Services sans l'accord préalable et écrit du Prestataire ;
- de l'utilisation des identifiants ainsi que de la gestion et de l'utilisation des comptes administrateurs le cas échéant. Le Client est également responsable des Utilisateurs. Il devra informer sans délai le Prestataire s'il constate une faille de sécurité liée notamment à la communication volontaire ou au détournement d'identifiants et de mots de passe, afin que le Prestataire puisse prendre sans délai toute mesure adaptée en vue de faire remédier à la faille de sécurité. Le Client s'engage à ne pas laisser accéder aux Services des personnes non autorisées et doit veiller à ce que chaque personne autorisée respecte les règles de confidentialité relatives à ses Identifiants ;
- de sa conformité aux dispositions législatives et réglementaires qui lui sont applicables, le cas échéant, au regard du droit qui lui est applicable et en particulier des dispositions identifiées à l'article 11 du Contrat. Concernant les dispositions relatives à la protection des données personnelles qui lui sont applicables, le Client garantit le Prestataire contre toute action qui pourrait être intentée à son encontre à ce titre et l'indemnise des sommes versées par lui le cas échéant, et ce dans la mesure où il est responsable au titre de l'action en cause.

Le Client déclare et garantit :

- qu'il dispose de toutes les autorisations nécessaires à l'exploitation des Données dans le cadre des Services et qu'il peut en concéder librement licence au Prestataire et à ses sous-traitants ;
- qu'en créant, installant ou téléchargeant les Données dans le cadre des Services, il n'excède aucun droit qui lui aurait éventuellement été concédé sur tout ou partie des Données et qu'il ne porte pas atteinte à des droits de tiers. Le Client veillera à ne pas placer, à l'occasion de l'utilisation des Services, des Données qui nécessiteraient que le Prestataire se conforme à des lois ou des réglementations spécifiques autres que celles expressément prévues dans le Contrat.

À ce titre, le Client s'engage à indemniser le Prestataire de toutes les conséquences pécuniaires que le Prestataire pourrait être amené à supporter en raison d'un manquement du Client au regard des garanties concernant les Données.`,
  },
  {
    key: "article-8",
    title: "ARTICLE 8 : CONDITIONS FINANCIÈRES",
    kind: "article",
    body: `Les conditions financières du présent Contrat sont stipulées au sein de l'Annexe 2.

Cette annexe indique les prix des Services fournis et les conditions de règlement. Les prix mentionnés pourront être révisés à l'initiative du Prestataire ; le Client en sera préalablement informé.

Le Client devra payer le montant total de chaque facture, sans pouvoir opérer une quelconque compensation avec des sommes dues ou prétendues exigibles de la part du Prestataire.

Les prix indiqués à l'Annexe 2 s'entendent hors taxes (HT). Toute taxe, contribution, retenue à la source ou tout droit de quelque nature que ce soit, exigible au titre des Services dans le pays d'établissement du Client, demeure à la charge exclusive du Client, de sorte que le Prestataire perçoive un prix net.

La TVA est appliquée conformément à la réglementation en vigueur. Pour les Clients assujettis établis dans un autre État membre de l'Union européenne et disposant d'un numéro de TVA intracommunautaire valide, la facturation est émise hors TVA par autoliquidation (article 196 de la directive 2006/112/CE). Pour les Clients établis hors de l'Union européenne, les Services sont facturés hors TVA française, le Client faisant son affaire personnelle des taxes éventuellement dues dans son pays. Si la législation du pays du Client imposait une retenue à la source, le montant dû au Prestataire sera majoré de telle sorte que ce dernier perçoive la somme qu'il aurait reçue en l'absence de retenue.

Les prix sont exprimés en euros et les paiements, sauf s'il devait être convenu autrement entre les Parties, devront être effectués dans cette devise par prélèvement SEPA ou, à défaut, par virement bancaire, sans frais pour le Prestataire, sur le compte bancaire de ce dernier dont les coordonnées sont précisées dans l'Annexe 2.

Les paiements devront parvenir au Prestataire dans les délais mentionnés dans l'Annexe 2. Tout retard de paiement entraînera l'application d'une pénalité égale à trois (3) fois le montant du taux d'intérêt légal en vigueur applicable en France, ainsi que d'une indemnité forfaitaire pour frais de recouvrement de quarante (40) euros, sans préjudice d'un complément d'indemnité sur justificatifs.

En cas de manquement par le Client à son obligation de paiement, le Prestataire sera en droit de suspendre les Services après une mise en demeure préalable de remédier au manquement sous DIX (10) jours, restée infructueuse, sans préjudice des autres actions ouvertes au Prestataire, et notamment au titre de l'article 12.`,
  },
  {
    key: "article-9",
    title: "ARTICLE 9 : PROPRIÉTÉ INTELLECTUELLE",
    kind: "article",
    body: `### 9.1 Titularité des droits de propriété intellectuelle

Chaque Partie est et demeure propriétaire de ses droits de propriété intellectuelle.

Le Prestataire demeure propriétaire de tous ses droits de propriété intellectuelle sur les Services, et en particulier sur les Applicatifs, y compris au titre d'éventuels développements spécifiques qui seraient réalisés à la demande du Client.

Le Client demeure propriétaire des Données.

### 9.2 Licence

- Le Prestataire concède au Client un droit personnel, non exclusif, non cessible et non transférable d'accès et d'utilisation des Services, en ce compris des Applicatifs, pour le territoire défini à l'article 7.1 et pendant toute la durée du Contrat, pour ses seuls besoins internes et à l'exclusion expresse de toute exploitation commerciale directe ou indirecte et/ou possibilité d'en concéder des licences à titre gratuit ou onéreux à des tiers. Il est précisé que les Utilisateurs ne constituent pas des tiers au sens de cet article et sont autorisés à accéder et à utiliser les Services dans les conditions des Annexes 1 et 2, qui définissent le périmètre exact de la licence. Aux fins de s'assurer du respect de la licence accordée, le Prestataire se réserve le droit d'effectuer des audits de l'utilisation des Services par le Client, via un accès à distance et/ou sur place dans les locaux du Client, ce que ce dernier reconnaît et accepte. Les audits sont limités à deux (2) par an et, dans le cas d'un audit sur place, sont soumis à un préavis de cinq (5) jours ouvrés. La présente licence est concédée à titre onéreux conformément à l'article 8 et à l'Annexe 2 et prendra fin automatiquement à la cessation du Contrat, sauf nécessité de poursuivre l'hébergement des Données et leur traitement, notamment dans le cadre de la mise en œuvre de la réversibilité telle que définie à l'article 10.
- Le Client concède au Prestataire (en ce compris ses sous-traitants) une licence non exclusive et mondiale, gratuite et cessible lui permettant d'héberger, de mettre en cache, de copier, d'afficher et plus largement de traiter les Données aux fins de l'exécution des Services et exclusivement en association ou à l'occasion de ceux-ci. La licence prendra fin automatiquement à la cessation du Contrat, sauf nécessité de poursuivre l'hébergement des Données et leur traitement, notamment dans le cadre de la mise en œuvre de la réversibilité conformément à l'article 10.`,
  },
  {
    key: "article-10",
    title: "ARTICLE 10 : RÉVERSIBILITÉ",
    kind: "article",
    body: `En cas de cessation du Contrat quelle qu'en soit la cause, le Prestataire s'engage, dans un délai de TRENTE (30) jours à compter de la demande du Client, à mettre à la disposition du Client l'ensemble des Données dans un format standard, exploitable et lisible. Il est précisé qu'en l'absence de demande du Client à l'issue de ce délai, le Prestataire n'est plus tenu de conserver les Données.

Les Parties collaboreront activement entre elles afin de faciliter la récupération des Données. Le cas échéant, le Prestataire collabore de bonne foi avec le nouveau prestataire choisi afin de permettre la continuité de l'exploitation des Données par le Client et ses Utilisateurs.

Les diligences du Prestataire au titre de l'exécution de cet article (restitution des Données et/ou collaboration avec un nouveau prestataire) sont celles considérées comme raisonnables par les usages en vigueur dans le secteur d'activité et pourront donner lieu à facturation si elles y sont supérieures.`,
  },
  {
    key: "article-11",
    title: "ARTICLE 11 : PROTECTION DES DONNÉES PERSONNELLES",
    kind: "article",
    body: `Chaque Partie s'engage à respecter les dispositions légales et réglementaires en vigueur applicables à la protection des données à caractère personnel dans le cadre de l'exécution du Contrat.

Dans le cadre de l'exécution du Contrat, le Prestataire (également désigné le « Sous-traitant ») est amené à traiter des Données Personnelles pour le compte du Client (également désigné le « Responsable de traitement »). Chacune des Parties s'engage à respecter la réglementation applicable en matière de protection des données, en particulier le règlement (UE) du 27 avril 2016 (« RGPD ») et la loi « Informatique et libertés » du 6 janvier 1978, ainsi que leurs obligations respectives en qualité de Sous-traitant et de Responsable de traitement.

Le Sous-traitant est autorisé, pour la durée du Contrat, à traiter pour le compte du Responsable de traitement les Données Personnelles nécessaires à son exécution. Les droits et obligations respectifs des Parties en leur qualité de Responsable de traitement et de Sous-traitant, la finalité du ou des traitement(s), la nature des opérations effectuées sur les données, les Données Personnelles traitées et les catégories de personnes concernées sont décrits en Annexe 5.

En toute hypothèse, il est rappelé que la conformité des Services aux dispositions du RGPD constitue un élément contributif mais non suffisant à la mise en conformité du Client avec l'ensemble des exigences réglementaires en matière de protection des données, et qu'à cet égard, la responsabilité du Prestataire relativement à cette conformité est strictement limitée au périmètre des Services opérés par ses soins. Le Client est seul responsable du respect des obligations qui lui incombent en tant que responsable de traitement au titre des dispositions relatives à la protection des données personnelles auxquelles il est soumis.`,
  },
  {
    key: "article-12",
    title: "ARTICLE 12 : CESSATION DU CONTRAT",
    kind: "article",
    body: `Chaque Partie peut mettre fin au Contrat de plein droit en cas de manquement de l'autre Partie à l'une de ses obligations au titre du Contrat, TRENTE (30) jours après l'envoi d'une mise en demeure adressée par lettre recommandée avec accusé de réception, restée sans effet, lorsque l'inexécution est réparable.

Chaque Partie sera en droit de mettre fin au Contrat de façon automatique, de plein droit et immédiatement en cas de violation :

- pour le Client, de ses obligations au titre des articles 7, 8, 11 et 13 ;
- pour le Prestataire, de ses obligations au titre des articles 5, 6, 10 et 13.

Le Contrat pourra être résilié de plein droit et de façon automatique en cas de survenance d'un cas de force majeure au sens de l'article 1218 du Code civil à réception d'une lettre recommandée avec accusé de réception adressée par l'une des Parties à l'autre, sans indemnité due de part et d'autre, si l'évènement de force majeure perdure au-delà d'une période de TROIS (3) mois, ou s'il n'a pas été possible de convenir d'une solution satisfaisante pour les Parties.

En cas de cessation du Contrat pour quelque cause que ce soit, chacune des Parties restituera, au plus tard au jour de la cessation effective du Contrat, tous les éléments et documents mis à sa disposition par l'autre Partie, notamment les Informations Confidentielles et tous les éléments et/ou documents sur lesquels elle dispose de droits de propriété intellectuelle. En outre, à l'issue de la phase de réversibilité telle que définie à l'article 10, le Prestataire s'engage à supprimer définitivement les Données, sauf disposition impérative lui imposant la conservation de tout ou partie.

Les obligations contractuelles qui, par stipulation expresse ou par nature, ont des durées supérieures à celle du Contrat, perdureront au-delà de la cessation du Contrat pour quelque cause que ce soit.`,
  },
  {
    key: "article-13",
    title: "ARTICLE 13 : CONFIDENTIALITÉ",
    kind: "article",
    body: `Chacune des Parties s'engage expressément, pendant la durée du Contrat et pendant DEUX (2) ans suivant sa cessation, pour quelque cause que ce soit, à tenir pour confidentielles toutes informations, de quelque forme et nature qu'elles soient, qu'elle recevra de l'autre concernant notamment son activité, ses fournisseurs, son savoir-faire, ses développements et projets, les éléments sur lesquels elle dispose de droits de propriété intellectuelle, en particulier les Services et la Solution, codes d'accès et identifiants, et toutes données à caractère commercial, technique, financier, personnel ainsi que les Données (ci-après désignées « les Informations Confidentielles »).

Chacune des Parties s'engage en ce qui concerne les Informations Confidentielles à :

- ne les utiliser qu'en vue de la bonne exécution du Contrat ;
- ne pas les communiquer à des tiers, sans l'accord écrit préalable de l'autre Partie ;
- prendre toutes les mesures nécessaires pour assurer l'intégrité, la confidentialité et la sécurité des Informations Confidentielles, notamment pour empêcher qu'elles soient déformées, endommagées, détournées ou fassent l'objet d'une utilisation frauduleuse ;
- informer immédiatement l'autre Partie en cas de constatation ou de présomption de divulgation des Informations Confidentielles à des personnes non autorisées et/ou d'atteinte à leur intégrité ou sécurité ;
- restituer sur-le-champ à l'autre Partie, sur simple demande de celle-ci, toutes Informations Confidentielles, y compris les copies qui en ont été faites. Cette restitution s'accompagne de la destruction définitive des Informations Confidentielles en sa possession, notamment celles qui seraient conservées dans son système d'information sur support numérique.

Cette obligation de confidentialité n'est pas applicable si la Partie destinataire peut apporter la preuve que les Informations Confidentielles :

- étaient déjà connues d'elle, en globalité, avant leur communication par l'autre Partie ou ont été développées indépendamment par elle ;
- ont été obtenues légitimement d'un tiers non lié par une obligation de confidentialité ;
- sont entrées dans le domaine public sans violation de la présente obligation.`,
  },
  {
    key: "article-14",
    title: "ARTICLE 14 : LOI APPLICABLE – JURIDICTION",
    kind: "article",
    body: `Le Contrat sera régi et interprété conformément au droit français.

En cas de mésentente surgissant entre les Parties, ces dernières tenteront de trouver une solution amiable conciliant leurs intérêts mutuels dans le respect du présent Contrat.

Dans le cas où aucun accord ne pourrait être trouvé entre les Parties dans un délai de trente (30) jours à compter de la sollicitation de la Partie la plus diligente, tous les litiges auxquels le présent Contrat pourrait donner lieu, notamment en ce qui concerne sa validité, son interprétation, son exécution ou sa résiliation, seront soumis aux tribunaux de la ville de {{prestataire.tribunal}}.`,
  },
  {
    key: "article-15",
    title: "ARTICLE 15 : DISPOSITIONS DIVERSES",
    kind: "article",
    body: `### 15.1 Renonciation

La non-revendication ou le non-exercice par une Partie de l'un quelconque de ses droits en vertu du Contrat n'implique pas une renonciation à ce droit pour l'avenir.

### 15.2 Divisibilité

La nullité d'une ou plusieurs stipulations du Contrat n'affecte pas la validité des autres stipulations du Contrat. Le cas échéant, les Parties feront leurs meilleurs efforts pour substituer à la clause frappée de nullité une clause qui se rapproche le plus possible de son contenu d'un point de vue juridique et économique.

### 15.3 Intégralité du Contrat

Le présent Contrat constitue l'intégralité des engagements pris par les Parties dans le cadre de son objet. Il remplace tous les accords verbaux et écrits antérieurs à sa signature, et pouvant s'y rapporter. Toute modification ne pourra intervenir que par accord écrit entre les Parties.

### 15.4 Intuitu personae

Le présent Contrat étant conclu intuitu personae, les Parties s'interdisent de céder ou de transférer, de quelque manière que ce soit, les droits et obligations en résultant, sans l'accord exprès, préalable et écrit de l'autre Partie. Par exception, le Prestataire pourra céder ou transférer le Contrat, sans accord préalable du Client, à toute société de son groupe ou dans le cadre d'une opération de fusion, d'apport, de cession de fonds de commerce ou de cession de la branche d'activité concernée, sous réserve d'en informer le Client.

### 15.5 Élection de domicile

Pour l'exécution des présentes et de leurs suites, les Parties élisent domicile en leur siège social ou leur domicile respectif tels qu'indiqués en en-tête des présentes.

Par conséquent, toutes notifications faites par l'une des Parties à l'autre seront valablement faites en leur siège social ou leur domicile.

En cas de changement d'adresse, la Partie concernée devra en informer l'autre Partie par courrier recommandé avec accusé de réception dans les sept (7) jours suivant ledit changement.

Fait électroniquement, en un exemplaire numérique signé par chacune des Parties.

{{signatures}}`,
  },
  {
    key: "annexe-1",
    title: "Annexe 1 : Applicatifs",
    kind: "annexe",
    body: `### L'application

L'application a pour objectif de digitaliser le pointage mais aussi l'organisation interne de clients du BTP.

**1. Les fonctionnalités principales**

Ses fonctionnalités principales sont :

- le pointage des ouvriers ;
- le suivi de l'organisation (personnel, engins) ;
- l'accès et les échanges de documents ;
- les notifications ;
- la gestion de profil.

**2. Les onglets**

Pour pouvoir accéder à toutes ces fonctionnalités, l'application est découpée en différents onglets dans la tab bar :

- Home ;
- Pointage ;
- Chantiers ;
- Profil.

**Home** – La page d'accueil sert de page récapitulative avec les notifications et les derniers documents.

**Pointage** – L'application permet de facilement effectuer le pointage des ouvriers sur les chantiers sur lesquels ils sont présents.

**Chantiers** – Les utilisateurs peuvent accéder à une base d'informations sur les chantiers qui les concernent, comme :

- des informations générales (adresse, équipe, …) ;
- l'organisation des véhicules (engins ≠ véhicules : un engin est un véhicule/machine de chantier alors qu'un véhicule sera principalement une voiture ou un utilitaire servant à déposer les ouvriers) ;
- les plannings des ouvriers et des engins ;
- différents documents d'échanges comme des plans ou des photos de dégâts avec, si besoin, des sous-dossiers.

**Profil** – Les utilisateurs peuvent toujours accéder à leurs données personnelles et les modifier si besoin dans leur profil.

### Le back office

Le back office de TIM Management permet la gestion interne de la logistique et de l'application.

Il est uniquement utilisé par les conducteurs de travaux et les administratifs, soit globalement des personnes présentes au siège du Client et non sur place sur les chantiers. Cependant, le back office est tout de même accessible sur les chantiers, au moyen d'un ordinateur ou d'une tablette.

**3. Détail des fonctionnalités principales**

Les fonctionnalités principales de l'application sont la gestion et le suivi de :

- feuilles d'heures ;
- planning ouvriers ;
- planning engins ;
- planning livreurs ;
- chantiers ;
- employés ;
- véhicules ;
- engins ;
- administrateurs ;
- chiffres clés.

L'application permet aussi d'exporter les heures des ouvriers.

**Administratif et responsable des factures et des documents de manière générale :**

- consultation et modification des plannings ouvriers/engins ;
- consultation des profils des employés ;
- création et modification des données : employés, chantiers, engins, entreprises, véhicules ;
- accès au budget ;
- gestion des factures ;
- export de feuilles d'heures spécifiques (sur une période, pour un ou plusieurs chantiers et un type d'ouvrier, pratique pour payer les agences d'intérim) ;
- vérification de l'actualisation des feuilles d'heures (si certains pointages ne sont pas bien faits) ; validation des feuilles d'heures, impossibles à modifier par la suite ;
- demande de validation au conducteur de travaux pour une facture ;
- téléchargement/partage de certains documents rangés dans des sous-dossiers ;
- ajout/modification des administrateurs du BO avec un nombre limité d'ajouts selon le super-admin.

**Conducteur de travaux :**

- participation au planning des ouvriers sur les différents chantiers ;
- gestion de l'organisation dans les véhicules ;
- validation des factures ;
- validation des pointages.`,
  },
  {
    key: "annexe-2",
    title: "Annexe 2 : Conditions tarifaires",
    kind: "annexe",
    body: `### Licences / Abonnements

[[si tarifPreferentiel.duree]]À titre dérogatoire, un tarif préférentiel et confidentiel est accordé au Client pour une durée de {{tarifPreferentiel.duree}} à compter de la date de signature du présent Contrat. Ces conditions sont strictement personnelles au Client et ne peuvent être divulguées à des tiers. À l'issue de cette période, les conditions tarifaires standard du Prestataire en vigueur s'appliqueront de plein droit.[[/si]]

Les conditions tarifaires des licences mensuelles applicables au Client sont les suivantes :

{{licences.tableau}}

Le prix de l'abonnement est automatiquement prélevé par un mandat de prélèvement SEPA.

Le rythme de prélèvement mensuel en début de période est défini d'un commun accord entre les Parties. À défaut d'accord, le prix de l'abonnement est prélevé selon un rythme mensuel, le {{prelevement.jour}} de chaque mois.

Coordonnées bancaires du Prestataire : IBAN {{banque.iban}} – BIC {{banque.bic}}

### Intégration

La mise en place de l'Applicatif dans la structure comprend l'installation, le paramétrage et la formation des équipes.

Le coût de l'intégration dépend du temps passé pour déployer la solution. Il est déterminé selon le nombre de données (employés, véhicules, chantiers) que le Client a lors de l'intégration de l'Applicatif.

Le tarif de cette prestation est fixé à {{integration.montant}} € HT.

[[si integration.offerte]]**À titre commercial, ces frais de mise en place sont offerts au Client dans le cadre du présent Contrat.**[[/si]]

### Personnalisation de l'Applicatif

Si certaines fonctionnalités ne sont pas prévues dans les différents modules et sont sollicitées par le Client, il sera proposé à ce dernier un développement spécifique pour les ajouter à l'Applicatif.

Un devis sera établi et proposé pour l'intégration de ce module, qui sera disponible pour tous les utilisateurs du logiciel.`,
  },
  {
    key: "annexe-3",
    title: "Annexe 3 : Niveau de Services (SLA)",
    kind: "annexe",
    body: `### Hébergement et mise à disposition d'un accès aux Applicatifs

Nos services sont exclusivement hébergés dans des datacenters situés en Union européenne :

- **DigitalOcean** : hébergement de l'application et de la base de données (régions UE – ex. Amsterdam/Francfort). Sécurité : https://www.digitalocean.com/security – RGPD : https://www.digitalocean.com/legal
- **AWS (Amazon Web Services)** : stockage des documents (régions UE – ex. Paris/Francfort). Sécurité : https://aws.amazon.com/fr/security/ – Conformité (dont RGPD) : https://aws.amazon.com/fr/compliance/ – Centre RGPD AWS : https://aws.amazon.com/fr/compliance/gdpr-center/

Les deux prestataires respectent les standards internationaux de protection des données, notamment le RGPD. Les échanges sont chiffrés en transit (TLS) et les données chiffrées au repos, avec contrôles d'accès, journalisation et sauvegardes régulières.

### Formation

Dans le cadre de la mise en service des Applicatifs, nous organisons des sessions de formation par typologie d'utilisateur :

- **Administrateur** : la formation se déroule soit par visioconférence, soit dans les locaux du Client. Selon le nombre de personnes à former, elle peut durer d'une demi-journée à un jour complet.
- **Conducteur de travaux** : la formation se déroule soit par visioconférence, soit dans les locaux du Client. Selon le nombre de personnes à former, elle peut durer d'une demi-journée à un jour complet.
- **Chef de chantier** : la formation se déroule soit par visioconférence, soit dans les locaux du Client, soit sur un chantier en cours. Selon le nombre de personnes à former, elle peut durer d'une demi-journée à un jour complet.

Lors de la formation, nous projetons le logiciel sur un écran afin de le présenter. Tous les participants ont en plus un support physique du déroulement étape par étape de chaque fonctionnalité du logiciel qu'ils garderont à la fin de la formation.

Selon les mises à jour du logiciel, nous pouvons organiser des formations par visioconférence.

### Maintenance

L'application et ses accessoires garantissent l'ensemble de la solution logicielle permettant de faire fonctionner l'application.

Cette garantie couvre les anomalies (bugs) constatées, la remise gratuite de toute nouvelle version de logiciels (release) et la mise à jour (updates) gratuite en cas de modification des règles comptables, fiscales ou juridiques mettant en cause la pertinence de l'application livrée.

Le Prestataire s'engage à mettre en œuvre les moyens raisonnables pour corriger les anomalies reproductibles qui lui sont signalées pendant la durée du Contrat, sans frais supplémentaires, conformément à l'article 6.2 du Contrat.

Le Prestataire garantit le bon fonctionnement du back-office sur les navigateurs Google Chrome, Mozilla Firefox, Microsoft Edge et Apple Safari, dans leur dernière version majeure et la version majeure précédente.

Le Prestataire garantit le bon fonctionnement des applications mobiles sur les iPhone équipés de l'une des deux dernières versions majeures d'iOS, et sur les terminaux équipés de l'une des deux dernières versions majeures d'Android.

En outre, le Prestataire garantit au Client la jouissance paisible de l'application.

La maintenance sera assurée du lundi au vendredi de 9 heures 30 à 17 heures 30, hors jours fériés, à distance (ex. téléphone, Teams).`,
  },
  {
    key: "annexe-4",
    title: "Annexe 4 : Sécurité",
    kind: "annexe",
    body: `Les développements sont basés sur un ensemble d'outils et de librairies logicielles, appelés frameworks (Laravel par exemple pour l'application web).

Ces frameworks, outre le fait d'accélérer le développement, permettent de bénéficier d'outils robustes et faciles à mettre à jour. Cela permet de faire évoluer plus facilement l'application, et de corriger rapidement les failles de sécurité potentiellement découvertes.

Outre cela, notre société utilise des bonnes pratiques « classiques », comme :

- le chiffrement de tous les échanges avec des certificats SSL signés par une autorité externe reconnue (Let's Encrypt en l'occurrence) ;
- la mise à jour régulière des middlewares et systèmes d'exploitation utilisés sur le web (Ubuntu, Apache, PHP, etc.) ;
- l'utilisation comme protocole d'authentification du standard OAuth 2, un standard universellement reconnu et robuste.

### Sécurité de gestion des données

- Application du « principe de privilège restreint », qui consiste à limiter l'accès aux données aux seules personnes en ayant besoin.
- Des backups quotidiens sont effectués et stockés à un autre endroit que les données elles-mêmes, afin de ne pas risquer la perte des données en cas de problème dans le datacenter concerné.`,
  },
  {
    key: "annexe-5",
    title: "Annexe 5 : Protection des données personnelles",
    kind: "annexe",
    body: `^**CHARTE DE PROTECTION DES DONNÉES PERSONNELLES — SOUS-TRAITANCE DE DONNÉES PERSONNELLES**

Le Responsable de Traitement et le Sous-Traitant ont conclu un contrat de fourniture de solutions et de prestations informatiques en mode SaaS (ci-après le « Contrat »).

Afin de fournir ces solutions et prestations, le Sous-Traitant est tenu de traiter les données à caractère personnel transmises par le Responsable de Traitement. La présente charte a pour objet de déterminer les conditions dans lesquelles le Sous-Traitant traite les données communiquées et en assure, conjointement avec le Responsable de Traitement, la sécurité dans le respect de la règlementation applicable (ci-après la « Charte »).

À titre liminaire, il est précisé que les termes commençant par une majuscule ont le sens qui leur est donné dans le Contrat.

### Quels acteurs ?

**Le Responsable de Traitement** (également dénommé le « Client ») : la société {{client.denomination}}, {{client.formeSociale}}, dont le siège social est sis {{client.adresse}}, immatriculée au Registre du Commerce et des Sociétés de {{client.villeRcs}} sous le numéro {{client.numeroRcs}}, représentée par {{representant.nom}}, {{representant.qualite}}, dûment habilité(e) à l'effet des présentes et pour la signature du présent contrat.

**Le Sous-Traitant** : la société {{prestataire.denomination}}, {{prestataire.formeSociale}}, dont le siège social est sis {{prestataire.adresse}}, immatriculée au Registre du Commerce et des Sociétés de {{prestataire.villeRcs}} sous le numéro {{prestataire.numeroRcs}}, représentée par {{prestataire.representant}}, {{prestataire.qualite}}.

### Quelles sont les conditions d'application de la Charte ?

La conclusion du Contrat vaut acceptation de la présente Charte de protection des données personnelles figurant en annexe.

Cette Charte pourra être modifiée à tout moment en cas d'évolution légale et jurisprudentielle, en fonction des décisions et recommandations de la CNIL ou des usages. Toute nouvelle version de la présente Charte sera portée à la connaissance du Responsable de Traitement par tout moyen défini par le Sous-Traitant, en ce compris la voie électronique. Elle se substituera à toute ancienne version à compter de sa date de prise d'effet.

### Quelles sont les notions clés de la règlementation sur la protection des données personnelles ?

Le « Règlement Général sur la Protection des Données » (RGPD), Règlement Européen 2016/679 du Parlement européen et du Conseil du 27 avril 2016, relatif à la protection des personnes physiques à l'égard du traitement des données à caractère personnel et à la libre circulation de ces données, et abrogeant la directive 95/46/CE, définit les termes suivants :

- **Données Personnelles** : toutes informations qui permettent, sous quelque forme que ce soit, l'identification des personnes physiques auxquelles elles s'appliquent. Est réputée identifiable une personne physique qui peut être identifiée notamment par référence à un nom, un numéro d'identification ou à un ou plusieurs éléments spécifiques, propres à son identité physique, physiologique, génétique, psychique, économique, culturelle ou sociale.
- **Personnes concernées** : personnes qui peuvent être identifiées, directement ou indirectement dans le cadre des activités du Sous-Traitant, c'est-à-dire l'ensemble des Utilisateurs.
- **Responsable de Traitement** : organisme qui – seul ou conjointement avec d'autres – détermine le « pourquoi » et le « comment » du traitement de données, c'est-à-dire sa finalité (objectifs poursuivis) et ses moyens (conditions de mise en œuvre, notamment sur le plan technique, matériel et organisationnel).
- **Sous-Traitant** : organisme qui traite des données pour le compte et sur instruction d'un autre organisme, le Responsable de Traitement.
- **Traitement de Données Personnelles** : toute opération appliquée à des données ou des ensembles de données à caractère personnel, telles que la collecte, l'enregistrement, l'organisation, la structuration, la conservation, l'adaptation ou la modification, l'extraction, la consultation, l'utilisation, la communication par transmission, la diffusion ou toute autre forme de mise à disposition, le rapprochement ou l'interconnexion, la limitation, l'effacement ou la destruction.

### Quel est le traitement des données personnelles opéré par le Sous-Traitant ?

Le Sous-Traitant est autorisé à traiter pour le compte du Responsable de Traitement les données à caractère personnel collectées dans le cadre de la mise à disposition du Client des Applicatifs et des Services associés, conformément au Contrat.

La nature des opérations réalisées sur les données est :

- l'accès, la consultation, l'utilisation, la modification, la suppression des données enregistrées par le Client sur le logiciel ;
- la sauvegarde et le stockage des données ajoutées au logiciel.

Les données à caractère personnel traitées sont :

- les données d'identification (nom, prénom, adresse mail, numéro de téléphone, raison sociale, numéro SIRET, etc.) ;
- les données de connexion (pays de connexion, logs, user ID, etc.) ;
- les données web (données de navigation, cookies, etc.) ;
- les données financières (données relatives aux données bancaires dans le cadre du paiement de l'abonnement).

Les catégories de personnes concernées sont les Utilisateurs des Applicatifs, bénéficiant des Services associés :

- l'administration ayant une licence (les personnes présentes au siège de la société cliente) ;
- les conducteurs de travaux ayant une licence (certains accès qui concernent leurs chefs de chantier et les employés liés aux chefs de chantier) ;
- les chefs de chantier (certains accès qui concernent leurs équipes d'employés).

### Qu'est-ce que le registre des activités de traitement ?

Le Sous-Traitant et le Responsable de Traitement tiennent un registre écrit de toutes les catégories d'activités de traitement effectuées en vertu des présentes comprenant :

- le nom et les coordonnées du Responsable de Traitement, du Sous-Traitant et des éventuels Sous-Traitants Ultérieurs et, le cas échéant, du délégué à la protection des données de chacun d'eux ;
- les catégories de traitements effectués ;
- le cas échéant, les transferts de données à caractère personnel vers un pays tiers ou à une organisation internationale, y compris l'identification de ce pays tiers ou de cette organisation internationale et, dans le cas des transferts visés à l'article 49, paragraphe 1, deuxième alinéa du RGPD, les documents attestant de l'existence de garanties appropriées ;
- dans la mesure du possible, une description générale des mesures de sécurité techniques et organisationnelles, y compris entre autres, selon les besoins : la pseudonymisation et le chiffrement des données à caractère personnel ; des moyens permettant de garantir la confidentialité, l'intégrité, la disponibilité et la résilience constantes des systèmes et des services de traitement ; des moyens permettant de rétablir la disponibilité des données à caractère personnel et l'accès à celles-ci dans des délais appropriés en cas d'incident physique ou technique ; une procédure visant à tester, à analyser et à évaluer régulièrement l'efficacité des mesures techniques et organisationnelles pour assurer la sécurité du traitement.

### Quels sont les droits et obligations du Sous-Traitant ?

Le Sous-Traitant :

- traite les données à caractère personnel pour le compte exclusif du Responsable de Traitement conformément à la règlementation en vigueur, aux finalités déterminées par lui, aux instructions transmises par écrit par ce dernier, et conformément à la présente Charte ;
- dispose des mesures techniques et d'organisation liées à la sécurité afin de traiter les données à caractère personnel communiquées ;
- communique immédiatement au Responsable de Traitement : toute demande contraignante de divulgation des données à caractère personnel émanant d'une autorité de maintien de l'ordre, sauf disposition contraire, telle qu'une interdiction de caractère pénal visant à préserver le secret d'une enquête policière ; toute obligation de procéder à un transfert de données vers un pays tiers ou à une organisation internationale, en vertu du droit de l'Union ou du droit français, avant le traitement, sauf si le droit concerné interdit une telle information pour des motifs importants d'intérêt public ; tout accès fortuit ou non autorisé ; toute demande reçue directement des personnes concernées sans répondre à cette demande, à moins qu'il n'ait été autorisé par écrit à le faire ; toute impossibilité ou incapacité de se conformer aux instructions du Responsable de Traitement notamment en raison d'une potentielle violation de la règlementation l'empêchant de remplir ses obligations, auquel cas, ce dernier a le droit de suspendre et/ou de résilier les présentes ;
- dans un souci de collaboration, répond dans les meilleurs délais aux demandes de renseignements du Responsable de Traitement relatives à ses opérations de traitement, aide le Responsable de Traitement pour la réalisation d'analyses d'impact relatives à la protection des données et pour la réalisation de la consultation préalable de la CNIL sur demande de ce dernier ;
- garantit la confidentialité des données à caractère personnel traitées dans le cadre de l'exécution du Contrat et veille à ce titre à ce que son personnel autorisé à traiter les données à caractère personnel s'engage également à respecter la confidentialité ou qu'il soit soumis à une obligation légale de confidentialité et reçoive la formation nécessaire en matière de protection des données à caractère personnel ;
- peut faire appel à un autre sous-traitant (ci-après, le « Sous-Traitant Ultérieur ») pour mener des activités de traitement spécifiques.

**Sous-Traitants Ultérieurs autorisés.** À la date de signature du Contrat, le Responsable de Traitement autorise expressément le recours aux Sous-Traitants Ultérieurs suivants :

- **DigitalOcean, LLC** : hébergement de l'application et de la base de données (datacenters situés en Union européenne) ;
- **Amazon Web Services EMEA SARL** : stockage des documents (datacenters situés en Union européenne).

Pour tout ajout ou remplacement ultérieur d'un Sous-Traitant Ultérieur, le Sous-Traitant en informe préalablement et par écrit le Responsable de Traitement. Cette information doit indiquer les activités de traitement sous-traitées, l'identité et les coordonnées du Sous-Traitant Ultérieur et les dates du contrat de sous-traitance. Le Responsable de Traitement dispose d'un délai de dix (10) jours à compter de la date de réception de cette information pour présenter ses objections. Cette sous-traitance ne peut être effectuée que si le Responsable de Traitement n'a pas émis d'objection pendant le délai convenu, étant précisé que toute objection du Responsable de Traitement devra être justifiée.

En tout état de cause, le Sous-Traitant Ultérieur est tenu de respecter les obligations des présentes pour le compte et selon les instructions du Responsable de Traitement. Il appartient au Sous-Traitant initial de s'assurer que le Sous-Traitant Ultérieur présente les mêmes garanties suffisantes quant à la mise en œuvre de mesures techniques et organisationnelles appropriées de manière à ce que le traitement réponde aux exigences du RGPD et de la loi française relative à la protection des données.

Le Sous-Traitant initial demeure pleinement responsable à l'égard du Responsable de Traitement en cas de manquement, par le Sous-Traitant Ultérieur, aux obligations en matière de protection des données qui lui incombent conformément audit accord écrit et à la règlementation en vigueur.

En cas de recours à un Sous-Traitant Ultérieur impliquant un transfert de données vers un pays tiers ne présentant pas de garanties suffisantes au sens du RGPD, le Sous-Traitant conclura avec le Sous-Traitant Ultérieur un contrat conforme à la règlementation en vigueur.

La responsabilité civile du Sous-Traitant Ultérieur est limitée à ses propres activités de traitement conformément aux présentes.

En cas de violation des données à caractère personnel, le Sous-Traitant notifie au Responsable de Traitement toute violation de données à caractère personnel dans un délai maximum de 48 heures après en avoir pris connaissance et par tout moyen écrit. Cette notification est accompagnée de toute documentation utile afin de permettre au Responsable de Traitement, si nécessaire, de notifier cette violation à la CNIL.

### Quels sont les droits et obligations du Responsable de Traitement ?

Le Responsable de Traitement :

- charge le Sous-Traitant de traiter les données à caractère personnel selon des instructions et pour des finalités conformes au RGPD, au droit français et à la présente Charte pendant toute la durée de leur relation contractuelle ;
- d'une manière générale, s'assure du respect d'une sécurité suffisante en vertu de la règlementation en vigueur, afin de protéger les données à caractère personnel contre une destruction fortuite ou illicite, une perte fortuite, une altération, une divulgation ou un accès non autorisé, notamment lorsque le traitement suppose la transmission de données par réseau, et contre toute autre forme illicite de traitement, et s'assure que ce niveau de sécurité est adapté aux risques liés au traitement et à la nature des données à protéger, eu égard au niveau technologique et au coût de mise en œuvre du traitement ;
- fournit au Sous-Traitant les données personnelles visées ci-avant ;
- documente par écrit et transmet au Sous-Traitant toute instruction supplémentaire concernant le traitement des données qui se rajouterait aux instructions initiales ;
- supervise le traitement, y compris en réalisant des audits et inspections auprès du Sous-Traitant ;
- en cas de violation des données à caractère personnel, fait son affaire personnelle de la notification de la violation de données à caractère personnel à la CNIL ainsi que de sa communication aux personnes concernées.

### Quels sont les droits des personnes dont les données personnelles sont collectées ?

**Droit d'information des personnes concernées**

Il appartient au Responsable de Traitement de fournir l'information aux personnes concernées par les opérations de traitement au moment de la collecte des données.

**Exercice des droits des personnes**

Dans la mesure du possible, le Sous-Traitant aide le Responsable de Traitement à s'acquitter de son obligation de donner suite aux demandes d'exercice des droits des personnes concernées : droit d'accès, de rectification, d'effacement et d'opposition, droit à la limitation du traitement, droit à la portabilité des données, droit de ne pas faire l'objet d'une décision individuelle automatisée (y compris le profilage), et droit de définir des directives relatives au sort de ses données après son décès.

Lorsque les personnes concernées exercent auprès du Sous-Traitant des demandes d'exercice de leurs droits, le Sous-Traitant doit adresser ces demandes dès réception par courrier électronique au Responsable de Traitement.

### Quelle est la responsabilité du Sous-Traitant et du Responsable de Traitement ?

**Responsabilité envers la personne concernée**

Toute personne concernée, ayant subi un dommage du fait d'un manquement par le Sous-Traitant, le Responsable de Traitement ou par un Sous-Traitant Ultérieur à l'une quelconque de leurs obligations respectives en vertu des présentes et de la règlementation en vigueur, a le droit d'obtenir la réparation du préjudice subi dans sa totalité de la part du Responsable de Traitement ou du Sous-Traitant.

La partie dont la responsabilité sera engagée ne peut s'exonérer de sa responsabilité que si elle prouve que le fait qui a provoqué le dommage ne lui est nullement imputable.

Toutefois, le Sous-Traitant ne peut invoquer un manquement par un Sous-Traitant Ultérieur à ses obligations pour échapper à ses propres responsabilités.

La responsabilité du Sous-Traitant Ultérieur est limitée à ses propres activités de traitement conformément à la présente Charte.

**Partage de responsabilité entre le Sous-Traitant et le Responsable de Traitement**

Si l'une des parties répare la totalité du préjudice subi par une personne concernée, elle peut en réclamer la part de réparation correspondant à la part de responsabilité de l'autre partie dans le dommage.

Sans préjudice des éventuelles actions en réparation intentées par la personne concernée ou des éventuelles sanctions prononcées par la CNIL ou toute autre autorité compétente, chaque partie est responsable envers l'autre des dommages qu'elle lui cause par suite d'un manquement aux présentes clauses.

La responsabilité entre les parties se limite au dommage effectif subi, à l'exclusion des dommages indirects tels que préjudice commercial, atteinte à l'image de marque, trouble commercial quelconque, perte de bénéfices, de gains et/ou de profits, perte de chance, perte de clients. En tout état de cause, le montant des dommages-intérêts qui pourraient être mis à la charge du Sous-Traitant en application des présentes, tout préjudice confondu et cumulé, si sa responsabilité était engagée, ne pourra excéder une somme correspondant à la moitié du montant annuel HT du Contrat conclu avec le Responsable de Traitement et effectivement payé par ce dernier. Tout dommage subi par un tiers est un dommage indirect, et ne donne pas lieu en conséquence à indemnisation.

### Quel est le sort des données collectées lorsque la relation contractuelle entre le Sous-Traitant et le Responsable de Traitement cesse ?

En cas de cessation du Contrat, quelle qu'en soit la cause, le Sous-Traitant (et éventuellement le Sous-Traitant Ultérieur, pour qui il se porte fort) s'engage, dans un délai de TRENTE (30) jours à compter de la demande du Responsable de Traitement, à transmettre l'ensemble des données à caractère personnel dans un format standard, exploitable et lisible. Le Sous-Traitant pourra également transmettre ces données au nouveau sous-traitant désigné par le Responsable de Traitement, dans les mêmes délais.

En l'absence de demande du Responsable de Traitement à l'issue de ce délai, le Sous-Traitant n'est plus tenu de conserver les données.

Toute transmission des données par le Sous-Traitant s'accompagnera de la destruction de toutes les copies existantes.

Le Responsable de Traitement reconnaît expressément que la destruction des données ou de leurs copies ne pourra être demandée en cas d'obligation de conservation légale ou règlementaire à laquelle serait soumis le Sous-Traitant ou le Sous-Traitant Ultérieur, et ce, dans la limite des données et de la durée strictement nécessaires au respect de ladite obligation. Dans ce cas, le Sous-Traitant garantit qu'il assurera la confidentialité des données à caractère personnel transférées et qu'il ne traitera plus activement ces données. Il se porte également fort que le Sous-Traitant Ultérieur respectera également cette obligation.

Le Sous-Traitant et le Sous-Traitant Ultérieur, pour qui le Sous-Traitant se porte fort, devront justifier à toute date du respect des obligations énumérées ci-dessus sur demande du Responsable de Traitement et/ou de la CNIL.

Fait électroniquement, en un exemplaire numérique signé par chacune des Parties.

{{signatures}}`,
  },
];

/** L'identité du prestataire livrée avec le code (reprise du modèle PDF). */
export const DEFAULT_PROVIDER = {
  denomination: "LC DEV",
  formeSociale: "Société par actions simplifiée",
  adresse: "131, Chemin du Bief – 69480 LUCENAY",
  villeRcs: "VILLEFRANCHE-TARARE",
  numeroRcs: "892 316 035",
  representant: "Monsieur Charlie PIANCATELLI",
  qualite: "Directeur Général",
  tribunal: "VILLEFRANCHE-SUR-SAÔNE",
};
