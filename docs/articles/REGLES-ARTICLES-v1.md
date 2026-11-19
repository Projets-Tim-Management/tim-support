# Règles des articles SEO/GEO — version 1

**Statut : version 1, validée par Charlie le 18/11/2026.** La version EN VIGUEUR vit désormais dans le support (Éditorial › Règles des articles) : ce fichier en est la version 1 et ne change plus. Les versions suivantes naissent des recommandations de Sergey que Charlie valide.
Cette version reprend tout ce que le pipeline Python (`~/claude/tim-management`) applique aujourd'hui, plus les leçons des revues d'octobre 2026. Les références détaillées (fichier:ligne, regex, tests) sont dans `docs/articles/inventaire-pipeline-python/`.

## Comment ce fichier évolue

- **Partie A — le socle verrouillé.** Vérifié par le code, bloquant. Aucun agent ne peut le modifier ; seul Charlie le change, et chaque changement est un développement (code + tests).
- **Partie B — les règles de rédaction.** Données au rédacteur. Elles ne changent que sur décision de Charlie (voir « La revue mensuelle de Sergey » ci-dessous). Le fichier est versionné et chaque article garde la version avec laquelle il a été écrit.
- **Partie C — les pièges connus du droit BTP.** Erreurs déjà commises, à ne jamais reproduire. Chaque ligne a une date de vérification.
- Une règle de B qui s'avère importante et vérifiable passe en A (par un développement).
### La revue mensuelle de Sergey (décision de Charlie, 18/11/2026)

Une fois par mois, Sergey et son équipe cherchent sur le web ce qui se fait aux États-Unis et en Europe en SEO, en GEO et au-delà, et que TIM Management ne fait pas encore : nouvelles règles de Google ou des moteurs IA, bonnes pratiques, formats qui gagnent, erreurs à éviter. Ils rendent à Charlie des **recommandations**, chacune avec :
- la règle proposée (ajout, modification ou retrait, et la partie concernée) ;
- **les preuves** : liens vers les sources, avec leur date, et ce qu'elles disent exactement ;
- le niveau de preuve : 1) documentation officielle (Google Search Central, documentation Google sur les AI Overviews / AI Mode, documentation publique d'OpenAI, Perplexity, Microsoft) ; 2) mesures sur nos propres articles (Search Console, citations IA) ; 3) études et blogs SEO, comme indices seulement ;
- ce que la règle changerait concrètement dans nos articles.

**Charlie valide ou refuse chaque recommandation.** Une recommandation validée devient une nouvelle version du fichier ; une recommandation refusée est gardée avec son motif, pour ne pas revenir le mois suivant. Rien ne change sans sa validation. Une recommandation qui touche le socle (A) devient un développement.

---

## A. Socle verrouillé (vérifié par le code, bloquant)

Un article qui enfreint une règle de A n'est jamais envoyé à WordPress : une relance avec la liste des erreurs, puis statut « À vérifier ».

### A1. Faits et sources — le cœur

1. **Seuls les faits vérifiés sont autorisés.** Chaque chiffre, pourcentage, montant, organisme nommé, référence légale, entreprise ou témoignage doit venir d'un fait de la fiche de l'article (`fait | source | url | année`) ou du cas client fourni par Charlie.
2. **Un fait trouvé par la recherche n'est retenu que si** : l'URL est une page précise (pas une page d'accueil), sur un domaine autorisé, réellement lue pendant la recherche ; l'extrait (≥ 40 caractères) figure mot pour mot dans la page ; tous les nombres du fait figurent dans l'extrait. Pas de site concurrent, même sur un domaine autorisé. Moins de 4 faits retenus → « À vérifier ».
3. **Domaines de recherche** : legifrance, service-public (.fr et .gouv.fr), code.travail.gouv.fr, travail-emploi.gouv.fr, urssaf, boss.gouv.fr, net-entreprises, impots.gouv, economie.gouv, ameli, insee, cnil, inrs, preventionbtp, cibtp, ffbatiment, fntp, capeb, francetravail, francenum.gouv, + domaines ajoutés pour l'article.
4. **Un chiffre n'est couvert que par un fait qui partage le contexte de la phrase** (au moins un mot porteur commun) : on ne détourne pas le nombre d'un fait vers un autre sujet.
5. **Organismes** (FFB, INSEE, CAPEB, OPPBTP, FNTP, DARES, Xerfi, Statista, ADEME, Banque de France, Observatoire des métiers du BTP) : jamais nommés sans fait qui les cite.
6. **Attributions** (« selon… », « d'après… », « une étude », « baromètre », « sondage », « source : ») : tous les nombres de la phrase doivent être sourcés ; une attribution sans chiffre doit correspondre à la source d'un fait.
7. **Montants en euros** : présents dans un fait (± 0,50 €) ; un montant calculé à partir des faits (× taux, × ou ÷ 12, 52, 35, 151,67, somme ou différence) est accepté avec un avertissement ; sinon refusé.
8. **Exemples de calcul** : un passage qui commence par « Exemple : », « Hypothèse : », « Exemple de calcul : » ou « Cas pratique : » peut poser des données, et chaque calcul « a × b = c € » doit être juste. Le passage s'arrête au prochain intertitre.
9. **Références légales** (article L/R/D, décret, loi n°, arrêté du, convention collective) : seulement si un fait dont l'URL est sur Légifrance, service-public ou code.travail.gouv.fr la contient.
10. **Chiffre de convention collective** : seulement depuis le texte de la convention sur Légifrance (URL `/conv_coll/` ou identifiant KALI). Si une synthèse officielle donne un autre chiffre pour le même sujet → « À vérifier » **avant** rédaction : le pipeline ne tranche pas, l'article rapporte les deux sources.
11. **Entreprises et personnes** (SARL, « l'entreprise X », « M. Dupont », « Prénom Nom, gérant »…) : seulement TIM Management, le cas client, ou la source d'un fait. Aucun témoignage si le cas client est vide.
12. **Un chiffre cité ⇒ au moins une source précise** dans le bloc Sources de l'article (les années seules et les numéros d'étape ne comptent pas).
13. **Le bloc Sources** est construit par le code à partir des seuls faits utilisés (jamais par le modèle), sans page d'accueil, sans doublon, jamais sur un site concurrent.
14. **Relecture de fidélité** (par un second appel au modèle, bloquante) : aucune phrase ne contredit un fait, ne l'étend au-delà de ce qu'il dit (une caisse, une région, une convention présentées comme générales ; « dans le BTP » pour une seule convention), ni ne transforme un facultatif en obligatoire ou l'inverse.
15. **Les chiffres relevés chez les concurrents ne vont jamais au rédacteur** : ils sont montrés à Charlie, « à vérifier », et n'entrent dans un article qu'ajoutés comme fait après vérification de la source primaire.

### A2. TIM Management

16. **Aucune note, aucun nombre d'avis, aucune étoile** dans l'article (la note est affichée ailleurs).
17. **Aucun fonctionnement hors connexion** (« hors ligne », « offline », « mode déconnecté », « sans réseau » + fonction).
18. **La marque s'écrit « TIM Management », en entier, à chaque mention** (décision de Charlie, 18/11/2026, qui remplace la règle d'octobre « Tim Management »). Jamais « Tim », « TIM » seul, « Tim Management » ni « TIM management ». Le contrôle `check_brand` est à inverser lors du port.
19. **Prix de TIM Management : seulement ceux de la page /offres** (tarifs publics depuis le 16/11/2026), relus le jour de la rédaction et fournis au rédacteur comme faits de référence. Aucun autre montant, aucune remise inventée.

### A3. Concurrents

20. **Un concurrent peut être nommé, jamais lié** (ni dans le texte, ni en source). Liste : Kelio, Bodet, Bizneo, Agendrix, Factorial, Eurécia, Skello, Combo, Snapshift, Traxxeo, Novade, Organilog, Keobat, Alobees, iXbat, CGSI, Batiscript, Hellio, Batappli, Codial, Everwin, Batigest, ProGBTP, Fieldwire, Vertuoza, Procore, Archipad, Finalcad, Obat, Graneet, Kizeo, Planday, Microsoft Project. **Ne sont pas des concurrents** : Kalitics (partenaire), Sage, Cegid, Onaya, Silae.

### A4. Liens

21. **Liens internes** : 3 minimum (avertissement au-delà de 5), tous présents dans le sitemap, dont au moins une page produit ou outil (pas /actualite, /contact, /fiche-metier, /centre-aide, /faq, /comparatif…). Les liens imposés par la fiche (page pilier, maillage prévu) sont obligatoires.
22. **Ancres descriptives** : jamais « ici », « cliquez ici », « en savoir plus », « lire la suite », « cet article », « voir »…
23. **Liens sortants** : jamais vers une page d'accueil ; seulement vers une URL d'un fait ou sur legifrance, insee, service-public, urssaf, ffbatiment, code.travail.gouv.fr. Les fichiers de la médiathèque (/wp-content/uploads/) sont permis.

### A5. Structure GEO

24. **TL;DR** en tête de l'introduction, exactement `<div class="tldr-box"><p>Points clés :</p><ul>…</ul></div>`, 3 à 5 points, sans attribut `style`.
25. **Capsule après chaque H2** : `<p><strong>…</strong></p>` immédiatement après le titre, **40 à 60 mots**, sans lien, sans pronom de reprise (« il », « elle », « cela », « ce dernier », « celui-ci »…). Une capsule fautive est réécrite automatiquement (2 essais).
26. **Chaque réponse de FAQ commence par une capsule** (mêmes règles).
27. **`<strong>` réservé aux capsules** (les autres sont retirés automatiquement).
28. **Au moins 60 % des H2 en question.**
29. **Hiérarchie des titres** : aucun `<h1>` dans le contenu ; le contenu commence par un H2 ; jamais de saut de niveau vers le bas (H2 → H4).
30. **Fan-out** : 5 à 8 sous-questions de lecteurs, chacune traitée par un H2 existant.

### A6. SEO

31. **Titre SEO** non vide, avec le mot-clé (avertissement au-delà de 60 caractères). **Meta description** non vide (avertissement au-delà de 155).
32. **Mot-clé dans les 50 premiers mots** après la TL;DR.
33. **H1** non vide, jamais « Guide complet / ultime / pratique / définitif » ni « Guide 2026 : ».
34. **Au moins 300 mots** (avertissement à ± 30 % de la longueur cible de la fiche).
35. **Pas de cannibalisation** : un mot-clé qui recouvre un article publié ou un autre article du tableau → « À vérifier » avant rédaction, sauf dérogation validée.
36. **Aucune trace de génération** (« en tant qu'IA », « je n'ai pas accès », « knowledge cutoff »…).

### A7. Garde-fous de processus

37. **Le rédacteur ne publie jamais.** L'article passe par : validation du texte par Charlie (bouton « Valider »), image principale déposée, puis créneau de publication.
38. **Au plus 2 publications par semaine, mardi et jeudi à 9 h.** Sans article prêt, rien ne part et le planning glisse.
39. **Mention de méthode** : `assistance_ia` vrai pour un article rédigé par le pipeline ; « relu par » et « relu le » remplis par la relecture humaine, jamais par un agent.
40. **Après publication, WordPress fait foi** : toute reprise part de la dernière version en ligne ; la date de mise à jour ne bouge que s'il y a un vrai changement ; les titres SEO marqués « à ne pas réécrire » ne sont jamais touchés ; un lien se remplace sur son adresse exacte, jamais sur un morceau d'adresse.

---

## B. Règles de rédaction (évolutives, proposées par l'équipe de Sergey)

### B1. Lecteur et intention
1. Lecteur : dirigeant de PME du BTP, conducteur de travaux, responsable paie. Ton expert, accessible, jamais promotionnel.
2. **TOFU** (découverte) : définitions, explications, exemples de chantier ; aucun argumentaire produit dans le corps. **MOFU** (méthode) : étapes, critères, comparaison des approches ; TIM Management n'est qu'une option parmi d'autres. **BOFU** (choix) : critères concrets, comparaison honnête ; les prix de TIM Management selon la règle B4 ; aucun autre prix hors faits.
3. Un angle différenciant, imposé par la fiche ou tiré des lacunes des concurrents, présent dès l'introduction et dans les H2.

### B2. Titre et introduction
4. H1 = la question exacte du lecteur ou la promesse exacte de l'article, avec le mot-clé.
5. TL;DR : points autonomes qui résument les faits de l'article, jamais l'argumentaire produit, sans mention de TIM Management.
6. Le mot-clé est défini en une phrase claire dans les 100 premiers mots.
7. Puis le problème du lecteur (chiffré seulement avec les faits), la promesse de l'article, un appel à l'action implicite.
8. **Les articles sont faits pour le trafic, pas pour la vente** (décision de Charlie, 18/11/2026). Place de TIM Management selon l'intention :
   - **TOFU et MOFU** (la grande majorité des articles) : pas de TIM Management dans l'introduction ni dans la TL;DR ; au plus une mention dans le corps, seulement là où elle aide vraiment le lecteur ; l'appel à l'action en conclusion, vers /contact ;
   - **BOFU, comparatifs et articles de choix d'un logiciel** : TIM Management peut être présenté comme une option, avec ses prix (règle 17 bis), à côté des autres.

### B3. Corps
9. Chaque section est autonome (150 à 300 mots), sans remplissage ni paraphrase. Longueur : celle que le sujet exige, ou la cible de la fiche (± 30 %), jamais de remplissage.
10. Capsule = réponse complète, compréhensible sans le reste de l'article, qui nomme l'entité en toutes lettres.
11. Format adapté : listes, étapes numérotées, paragraphes de 3-4 lignes ; un vrai tableau dès qu'il y a une comparaison ou des valeurs par cas.
12. **Apport propre obligatoire** : au moins un élément qu'un résumé des sources n'aurait pas (exemple chiffré pas à pas à partir des faits, check-list ou arbre de décision de chantier, cas client réel s'il existe). Jamais d'expérience, de témoignage ni de citation d'expert inventés.
13. Sans cas client : situations de chantier génériques (« un conducteur de travaux qui suit plusieurs sites… »), sans nom, sans chiffre, sans résultat.
14. Ne jamais généraliser un fait : un fait sur une caisse, une région ou une convention est présenté comme tel.
15. Mots-clés secondaires : 1 à 2 fois chacun, dans un H2, une capsule ou la FAQ, jamais de bourrage.
16. Articles voisins déjà publiés : ne pas traiter leur sujet principal ; le résumer en une ou deux phrases et faire un lien.

### B4. TIM Management dans l'article
17. Faits de référence, seuls autorisés : « Premier mois offert, sans engagement » sur les modules payants ; « Démarrez gratuitement » avec un compte gratuit (les deux existent, confirmé par Charlie le 18/11/2026 ; ne décrire le contenu du compte gratuit que dans les termes de la page /offres) ; données hébergées en Europe ; **les tarifs de la page /offres**.
17 bis. **Prix de TIM Management : seulement dans un comparatif, un article de choix de logiciel (BOFU) ou une proposition.** Jamais dans un article de trafic (TOFU, MOFU). Quand ils sont cités (page /offres, mise à jour du 16/11/2026) :
   - toujours « dès » / « à partir de », **HT, par mois et par entreprise**, comme sur la page : Planning ou Pointage dès 29 €, Planning + Pointage dès 39 €, Stock dès 49 €, module Stock ajouté +40 €/mois (Planning + Stock ou Pointage + Stock dès 69 €, les trois dès 79 €) ;
   - paiement annuel : −10 %, facturé une fois par an ;
   - préciser que le montant exact se fait sur devis, et lier la page https://tim-management.co/offres ;
   - suivi de chantier, employés et application web et mobile inclus quels que soient les modules ; ouvriers, sociétés et stockage illimités ; sans engagement ;
   - jamais de remise par volume ni de prix par utilisateur (absents de la page) ; jamais d'autre montant ;
   - la date de vérification est gardée dans la fiche de l'article pour le refresh.
18. Une fonctionnalité de TIM Management n'est citée que si une page produit du sitemap la décrit, dans ses termes, avec un lien vers cette page (sauf si elle est déjà liée).
19. Aucune promesse de conformité, de résultat ni de chiffre : jamais « garantit », « fiabilise », « sécurise », « supprime les erreurs », « en 2 clics », « −50 % », « LA solution », « des outils comme TIM Management… ».
20. Appel à l'action : uniquement vers https://tim-management.co/contact ; jamais « demandez une démonstration » ni une page de démo.
21. Une page produit de TIM Management n'est jamais une source.

### B5. Concurrents
22. Nommer un concurrent seulement quand c'est utile au lecteur, sans le recommander, sans rien affirmer sur lui hors des faits. Prix et plateformes relevés sur son site le jour même, datés, revérifiés chaque trimestre.

### B6. FAQ, liens, métadonnées
23. FAQ : 4 à 6 vraies questions de lecteurs, distinctes des H2, aucune question inventée pour remplir.
24. Liens internes vers les pages les plus proches du sujet ; un intertitre ne promet que ce que l'article contient (fichier réellement téléchargeable, exemples réellement chiffrés, « gratuit » exact).
25. Titre SEO : mot-clé au début, unique sur le site. Meta description : avec le mot-clé, dit ce que la page apporte, différente du premier point de la TL;DR.
26. Pas d'année dans un titre ou une question sans fondement.

### B7. Médias
27. 2 à 3 visuels proposés (position après un H2, description, texte alternatif), dont l'image principale, dont le prompt est rédigé par Noé selon la charte design (à définir).
28. Un script vidéo de 60 à 90 s (150 à 220 mots), soumis aux mêmes règles factuelles.

---

## C. Pièges connus du droit BTP (vérifiés en octobre 2026)

Erreurs déjà publiées puis corrigées. Elles ne dispensent pas des faits sourcés : ce sont des alertes pour le rédacteur et le relecteur. Chaque valeur est à revérifier à sa date d'échéance.

1. **Conservation des feuilles d'heures : 1 an** (D3171-16) ; 3 ans = prescription des salaires. Jamais « 5 ans selon L3171-3 ».
2. **Contingent d'heures supplémentaires : jamais une règle unique du BTP.** Sources divergentes (FFB / Code du travail numérique 180 h ou 145 h ; accord du 6/11/1998 sur Légifrance 265 h ou 300 h) : les rapporter sans trancher. Travaux publics : aucun chiffre.
3. **Il n'y a pas « une convention collective du BTP »** : bâtiment (≤ 10 et > 10 salariés), travaux publics, ETAM, cadres. Toujours nommer la convention.
4. **Montants régionaux** (paniers, zones, trajets) : jamais présentés comme nationaux ; un exemple régional est nommé, daté, sourcé et présenté comme illustration.
5. **Barèmes annuels** : année et source officielle ; si le barème de l'année n'est pas confirmé, l'écrire.
6. **Heures supplémentaires** : décomptées par semaine, pas par mois.
7. **Congés pendant un arrêt maladie non professionnel** : ils en génèrent depuis la loi du 22/04/2024.
8. **Chômage intempéries** : 55 jours par année civile (pas « 55 h par hiver ») ; ETAM et cadres ne sont pas exclus d'office.
9. **Pause de 20 minutes** : non fractionnable (Cass. soc. 20/02/2013).
10. **Une bonne pratique n'est pas une obligation** (ex. « horodatage certifié ») ; règles CNIL sur la géolocalisation des véhicules ≠ règles du pointage.
11. **Amendes** : ne pas attribuer au défaut de vigilance les sanctions du travail dissimulé.
12. **Échéances connues** : articles du CGI abrogés au 01/01/2027 (articles 6876, 6989, 6877 à revoir en janvier 2027) ; tarifs des concurrents de 4239 et 6595 chaque trimestre.

---

## D. À ajouter au code lors du port (aujourd'hui consigne seulement)

Ces règles de B ou C ne sont vérifiées par aucun code aujourd'hui ; proposées pour passer en A :
1. Appel à l'action vers /contact uniquement, et aucune page de démo.
2. Liste noire de promesses (« garantit », « fiabilise », « sécurise », « supprime les erreurs », « des outils comme TIM Management »).
3. Nombre de questions de FAQ (4 à 6) dès la création.
4. Détecteurs des pièges connus : « 5 ans » + feuilles d'heures ; contingent présenté pour tout le BTP ; « convention collective nationale du BTP ».
5. Place de TIM Management selon l'intention : TOFU/MOFU sans TIM Management dans la TL;DR ni l'introduction, une mention au plus dans le corps, aucun prix ; prix seulement en BOFU / comparatif.
6. Lien interne vers un slug redirigé, vers l'article lui-même, ancre `#` sans cible.
7. Adresse finale des sources (pas de redirection : service-public.gouv.fr, nouvelle arborescence BOSS).
8. Format du slug.
9. **Prix de TIM Management** : le support relit la page /offres avant chaque rédaction et donne la grille au rédacteur comme faits de référence (sans quoi le contrôle des montants refuserait ces prix) ; un prix de TIM Management absent de la grille est refusé ; quand /offres change, les articles qui citent un prix passent « À rafraîchir ».

## E. Décisions à prendre avant le port (défauts trouvés dans le pipeline actuel)

1. **Mots vides définis deux fois** (`validation.py`) : la seconde liste écrase la première, donc « selon », « taux », les mois comptent comme mots de contexte et un chiffre peut être « couvert » par un fait qui ne partage que « taux ». Proposition : corriger, avec des tests.
2. **Référence légale validée par simple inclusion** : « article L3171-4 » passe si le fait cite L3171-45. Proposition : comparer le numéro exact.
3. **Lien interne reconnu par la fin de l'adresse** (`…tim-management.co` sans point) : un faux domaine passerait. Proposition : corriger.
4. **Écarts prompt / code** : FAQ 3-6 (création) contre 4-6 (refresh) → 4-6 partout ; script vidéo 150-220 mots (prompt) contre 130-250 (code) → garder la tolérance du code.
5. **Fiches métier publiées directement, sans contrôle** : proposition, les faire passer par le même tableau et les mêmes contrôles lors de leur migration.
6. **Défauts de fonctionnement à ne pas reproduire** : brouillon en double si l'e-mail échoue après la création ; article bloqué (`max_tokens`, refus) relancé chaque jour ; aucun verrou contre deux traitements simultanés.

## F. La note SEO/GEO de chaque article (à construire en fin de chantier — demande de Charlie, 18/11/2026)

Chaque article reçoit une **note en %**, une pour le **SEO** et une pour le **GEO**, calculée à sa création puis à chaque reprise :
- elle mesure le respect des consignes de ce fichier : nombre de mots, TL;DR, capsules de 40 à 60 mots, part des H2 en question, fan-out, maillage interne, sources précises, titre et meta description, mot-clé en ouverture, FAQ, place de TIM Management selon l'intention… ;
- le détail montre chaque critère, réussi ou non, et ce qui manque pour gagner des points ;
- **elle suit la version des règles** : quand une recommandation de la revue mensuelle de Sergey est validée, les critères changent, les notes de tous les articles sont recalculées, et un article qui baisse passe en évidence (« À rafraîchir » proposé) ;
- les articles déjà en ligne sont notés aussi, ce qui donne l'ordre des reprises.
