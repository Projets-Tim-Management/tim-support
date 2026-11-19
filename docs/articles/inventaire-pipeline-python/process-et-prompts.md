# Pipeline articles tim-management : déroulé, prompts, sorties

Source lue (lecture seule) : `/Users/charliepiancatelli/claude/tim-management` (état au 18/11/2026).
Fichiers lus en entier : generator.py, main.py, research.py, refresh.py, scraper.py, wordpress.py, sheets.py, notifier.py, http_client.py, config.py, README.md. Survolés : main_metiers.py, metiers_*.py, francetravail.py. `validation.py` est inventorié par un autre agent ; seuls quelques constantes et l'enchaînement de `validate_article` (validation.py:1240-1275) ont été regardés ici pour classer les règles. `.env` et `credentials/` n'ont pas été ouverts.

Modèle Claude : `CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-4-8")` (config.py:50). Le même modèle sert à tous les appels (génération, réécriture des capsules, relecture de fidélité, recherche, refresh, fiches métier). La valeur réelle dans `.env` n'a pas été lue.

---

## 1. Déroulé complet d'un article (main.py, cron quotidien à 10h)

Point d'entrée : `main.run()` (main.py:208). Crontab : `0 10 * * * … main.py >> logs/cron.log` (README.md:114, logs/crontab-2026-09-27.txt).

### Étape 0 : lecture du Sheet
- `sheets.get_pending_articles()` (sheets.py:141), puis `sheets.get_article_rows()` (sheets.py:157, utilisé pour le contrôle de cannibalisation).
- Lecture : Google Sheets API v4, `SPREADSHEET_ID`, onglet `SHEET_NAME` (défaut `crea-articles`, config.py:10), plage `A1:ZZ` (sheets.py:72-75). Auth OAuth « application de bureau » via `auth.py` (token local).
- Colonnes A-H **par position** (sheets.py:16-20, 104) : `ID | statut | type | date_publication | cluster_seo | categorie_site | titre_h1 | slug_url`.
- Colonnes suivantes **par en-tête normalisé** (sheets.py:26-35, 44-56), seulement si l'index est ≥ 8 : `mot_cle_principal`, `faits_sources`, `cas_client`, `auteur`, `angle`, `url_concurrent_1..3`, `wp_id`, `erreur_pipeline`, `cannibalisation_validee`, `mots_cles_secondaires`, `intent`, `wordcount`, `page_pilier`, `maillage_sortant`, `brief_notes`, `domaines_recherche`.
- `parse_row` (sheets.py:96-138) produit le dict de l'article : `keyword` = mot-clé principal, sinon cluster ; `faits` = `parse_faits_sources` (format « fait | source | url | année », une ligne par fait, lignes mal formées dans `faits_invalides`) ; `auteur` = ID WP ou nom connu (`AUTHOR_IDS_BY_NAME` : Charlie = 1, Aude Pretrelini = 4 ; défaut 1, config.py:19-24) ; `intent` en majuscules (TOFU/MOFU/BOFU) ; `wordcount` entier ; `mots_cles_secondaires` séparés par des virgules ; `domaines_recherche` extraits par regex.
- Filtre (sheets.py:146-153) : statut = `Planifié` (insensible à la casse), type = `article`, date vide, du jour ou passée (formats `%Y-%m-%d`, `%d/%m/%Y`, `%d-%m-%Y` ; format inconnu = traité).
- Statuts (sheets.py:7-11) : `Planifié` → `En cours` → `Généré` ou `À vérifier` ; `Publié` est posé à la main.
- Les articles dus sont traités **séquentiellement** dans la même exécution (main.py:226).

### Étape 1 : garde-fous avant génération (main.py:73-115)
1. **Cannibalisation** (main.py:80-88) : sauf si `cannibalisation_validee` est rempli, `v.cannibalization_conflicts(keyword, urls du sitemap, autres lignes)` ; un conflit → `À vérifier` sans génération, avec le message « Mettre à jour l'article existant, changer de mot-clé, ou remplir la colonne « cannibalisation_validee »… ». (Le sitemap est donc récupéré dès cette étape.)
2. **`faits_sources` vide** → recherche automatique (étape 2 ci-dessous). Moins de `MIN_FAITS = 4` faits retenus → `À vérifier` (main.py:96-100). Sinon les faits sont écrits dans la cellule `faits_sources` (`sheets.update_faits`, sheets.py:216) et `faits_recherches = True`.
3. **Divergence de sources** (main.py:104-108) : `v.convention_divergences(faits)` : deux faits du même `[sujet]` dont le texte de la convention (Légifrance) et une synthèse officielle donnent des chiffres différents → `À vérifier` sans génération.
4. Statut → `En cours` (main.py:117).

Remarque : le README (ligne 109) et le commentaire du crontab disent encore « un article dont faits_sources est vide est ignoré ». Le code actuel (depuis le 03/11/2026) lance la recherche automatique à la place. Le compteur `skipped_count` de main.py n'est plus jamais incrémenté (process_article ne retourne jamais None).

### Étape 2 : recherche des faits (research.py, seulement si `faits_sources` est vide)
- Fonction : `research.research_facts(info)` (research.py:204).
- **Un appel Claude agentique** en streaming, éventuellement relancé en cas de `pause_turn` (au plus `MAX_PAUSES + 1 = 5` requêtes, research.py:88-110).
  - `model=CLAUDE_MODEL`, `max_tokens=32000` (`MAX_TOKENS_RESEARCH`), `thinking={"type": "adaptive"}`, `system=RESEARCH_SYSTEM`.
  - Outils serveur (research.py:47-54) :
    - `web_search_20250305`, `max_uses=8`, `allowed_domains` = `RESEARCH_DOMAINS` + `domaines_recherche` de la ligne, `user_location={"type":"approximate","country":"FR"}` ;
    - `web_fetch_20250910`, `max_uses=12`, mêmes `allowed_domains`, `max_content_tokens=30000`.
    - Les versions « de base » des outils sont choisies exprès pour récupérer le texte brut des pages, qui sert à la vérification (research.py:12-13).
  - `RESEARCH_DOMAINS` (config.py:54-59) : legifrance.gouv.fr, service-public.fr, service-public.gouv.fr, code.travail.gouv.fr, travail-emploi.gouv.fr, urssaf.fr, boss.gouv.fr, net-entreprises.fr, impots.gouv.fr, economie.gouv.fr, ameli.fr, insee.fr, cnil.fr, inrs.fr, preventionbtp.fr, cibtp.fr, ffbatiment.fr, fntp.fr, capeb.fr, francetravail.fr, francenum.gouv.fr.
- System (research.py:35-40) : « Tu es documentaliste juridique et social spécialisé BTP. Tu cherches et lis des sources officielles françaises, et tu ne rapportes que ce que tu as lu toi-même dans une page récupérée avec web_fetch. Tu n'inventes jamais un chiffre, une date, une référence ni une URL. Ta réponse finale est UNIQUEMENT un objet JSON valide, sans markdown. »
- Prompt (research.py:57-81) : lectorat = dirigeants de PME du BTP, conducteurs de travaux, responsables paie ; contexte = mot-clé, titre prévu, mots-clés secondaires, angle, notes de l'éditeur. Méthode :
  1. chercher avec web_search, puis **lire** avec web_fetch les pages les plus précises (Légifrance, service-public, Urssaf, BOSS, code.travail, CIBTP, OPPBTP, INRS, CNIL…) ; une page d'accueil n'est jamais une source ;
  2. retenir 4 à 15 faits utiles (règles, conditions, délais, taux, montants, obligations, sanctions, définitions) ; valeurs en vigueur l'année courante, sinon pas de valeur ;
  3. référence légale seulement si lue sur Légifrance ou sur une fiche officielle qui la cite ; chiffre conventionnel seulement lu dans le texte de la convention, et le fait nomme la convention (pas « dans le BTP ») ;
  4. rien sur Tim Management ; jamais le site d'un concurrent ; doc d'un éditeur de paie seulement pour sa propre procédure, sur son domaine officiel.
  - Champs de chaque fait : `fait` (dit exactement ce que dit la page), `extrait` (20 à 60 mots copiés mot pour mot, contenant tous les nombres du fait), `source` (« Organisme, titre de la page »), `url` (URL exacte lue), `annee`.
  - Sortie : `{"faits": [{"fait","extrait","source","url","annee"}]}`.
- **Vérification par le code** (`verify_facts`, research.py:152-185). Un fait est écarté si : champ manquant ; URL de page d'accueil ; site concurrent ; domaine non autorisé ; URL non lue pendant la recherche ; page sans texte (PDF) ; extrait de moins de 40 caractères ou introuvable mot pour mot dans la page (comparaison « aplatie » : sans Markdown, accents, ponctuation typographique, `_flat` research.py:132-144) ; nombre du fait absent de l'extrait. 15 faits au plus sont gardés.
- Sorties : liste `{fait, source, url, annee}` écrite dans le Sheet (`format_cell`, research.py:188) et trace `output/recherche/<slug>.json` (pages lues, candidats, retenus, écartés). L'e-mail du brouillon ajoute un avertissement demandant de relire `faits_sources` (main.py:165-167).
- Durée : non observée dans les logs (aucune exécution de la recherche dans `logs/cron.log`). Avec 8 recherches et 12 lectures, il faut probablement compter plusieurs minutes.

### Étape 3 : sitemap (scraper.py)
- `main.get_sitemap()` (main.py:29), mis en cache pour l'exécution : `scraper.scrape_sitemap("https://tim-management.co/sitemap.xml")` (scraper.py:17-55). XML seulement (index récursif), 500 URL au plus, exclusion de `/wp-`, `/feed`, `/tag/`, `/page/`. Timeout 10 s, en-têtes de navigateur. En cas d'erreur, liste vide, sans blocage.
- Volume observé : 175 URL le 18/11/2026 (logs/cron.log). Toutes sont injectées dans le prompt (300 au plus, generator.py:84-90).

### Étape 4 : scraping des concurrents (scraper.py)
- Pour chaque `url_concurrent_1..3` non vide : `scraper.scrape_competitor(url)` (scraper.py:153). Ne lève jamais d'exception ; une erreur donne une fiche vide.
- HTTP : `http_client.fetch(url, timeout=15)` (http_client.py:54) : `requests` avec en-têtes Chrome, puis repli sur `curl --http1.1` si 403 ou coupure (contournement de Légifrance, de l'Urssaf et du BOSS, http_client.py:4-14).
- `extract_competitor` (scraper.py:86-150, BeautifulSoup + lxml) : `h2s` (10 au plus), `h3s` (15 au plus), `questions` (titres finissant par « ? », blocs `faq`, JSON-LD `FAQPage` ; 20 au plus), `text_sample` (2 000 caractères), `authority_links` (5), `chiffres_sources` (phrases avec %, ou attribution et nombre, ou organisme et nombre ; 15 au plus).
- Seuls H2, H3 et questions vont dans le prompt (`_format_competitor_context`, generator.py:93-110 : 6 H2, 8 H3, 10 questions par concurrent). **Les chiffres n'y vont jamais** : ils partent dans l'e-mail comme « à vérifier » (`competitor_facts`, main.py:48-54).

### Étape 5 : génération (generator.generate_article, generator.py:516-568)
- Préparation : `required` = URL du site citées dans `page_pilier` et `maillage_sortant` qui existent dans le sitemap (`v.resolve_site_urls`) ; `related` = articles publiés voisins (`v.related_articles`, 12 au plus, au moins un mot porteur commun).
- Prompt : `build_prompt` (generator.py:141-294), system `SYSTEM_PROMPT` (generator.py:67-69). Détail en section 2.
- **Appel 1** : `_call_claude` (generator.py:299-316) : `client.messages.stream`, `max_tokens=32000` (`MAX_TOKENS_ARTICLE`), **sans outils, sans thinking**, sans température explicite. `stop_reason == "max_tokens"` ou `"refusal"` → RuntimeError (statut remis à `Planifié` par main.run, main.py:243).
- Post-traitement `_finalize` (generator.py:395-423) :
  1. `parse_json_response` ; JSON invalide → erreur de validation (donc retry) ;
  2. `sanitize_article` (nettoyage HTML, attributs `style` retirés), `unwrap_article_strong` (retire les `<strong>` hors position de capsule) ;
  3. H1 forcé à `clean_h1(titre_h1)` si la colonne G est remplie ;
  4. **Réécriture des capsules fautives** `fix_capsules` (generator.py:355-383) : chaque `<strong>` qui pose problème (`v.capsule_problems` : hors 40-60 mots, lien, reprise pronominale) part dans `rewrite_capsule` → **un appel Claude par capsule et par essai**, 2 essais au plus (`CAPSULE_REWRITE_ATTEMPTS`), `max_tokens=1024`, system « Tu es un rédacteur web SEO/GEO rigoureux. Tu n'inventes jamais de fait. ». Observé : 2 à 12 capsules réécrites par article (logs/cron.log) ;
  5. `v.validate_article` (contrôles bloquants et avertissements, voir l'inventaire de validation.py) ;
  6. `faits_utilises` déclarés par le modèle + faits détectés → `article["sources"] = v.build_sources(...)` (lignes `faits_sources` avec URL, sans page d'accueil, dédoublonnées) ; `check_sources` et contrôle des liens concurrents dans `sources` ;
  7. champs ajoutés par le code : `methode = {"assistance_ia": True, "note_methode": "Article rédigé avec assistance IA à partir de sources vérifiées, relu avant publication."}`, `date_mise_a_jour = ""`, `resume_mise_a_jour = ""`, `temps_de_lecture = "<mots/230> min"` (generator.py:388-392).
- **Relecture de fidélité** `_finalize_checked` → `check_fidelity` (generator.py:460-513) : seulement si la validation passe et qu'il y a des faits ; **un appel Claude**, `max_tokens=4096`, system `FIDELITY_SYSTEM`. Chaque contradiction devient une erreur bloquante. Une réponse illisible est ignorée.

### Étape 6 : validation et retry
- Une erreur à la tentative 1 entraîne **un seul retry** dans la même conversation (generator.py:550-565) : messages = prompt, réponse brute, puis `_retry_message` (generator.py:431-448). Ce message liste les erreurs (40 au plus) et demande : « Corrige TOUS ces points et renvoie l'article complet, au même format JSON. Pour tout fait, chiffre, organisme, référence légale ou entreprise absent de FAITS VÉRIFIÉS / CAS CLIENT : supprime-le, ne le reformule pas. Pour une erreur « Fidélité au fait » : réécris la phrase pour qu'elle dise exactement ce que dit le fait, ou retire-la. » Il ajoute les **faits non utilisés** (`unused_facts`, generator.py:451-454) à intégrer s'ils servent le lecteur.
- La tentative 2 repasse par `_finalize_checked` (nouvelles réécritures de capsules et nouvelle relecture de fidélité). Si des erreurs restent : `ValidationFailed` → `mark_to_verify` (main.py:57-70) : JSON enregistré dans `output/article_<slug>_a-verifier.json`, statut `À vérifier`, erreurs dans `erreur_pipeline` (1 000 caractères au plus, sheets.py:225-238), e-mail « À vérifier ». Aucun brouillon.
- Garde-fou supplémentaire juste avant WordPress : `v.check_sources(article)` (main.py:160-162).
- Historique des tentatives dans `generator.LAST_ATTEMPTS` (diagnostic seulement).

### Étape 7 : brouillon WordPress (wordpress.create_draft, wordpress.py:123-146)
- Enregistrement local au préalable : `output/article_<slug>.json` (main.py:38-45, 176).
- Catégorie : `CATEGORY_IDS_BY_NAME[norm(categorie)]` (config.py:28-36). Détail du payload en section 3.
- `POST`, timeout 30 s, `raise_for_status` (une erreur HTTP part dans `except Exception` de main.run → statut remis à `Planifié`).
- Après succès : `sheets.update_wp_id(row, id)` (seulement si la colonne `wp_id` existe).

### Étape 8 : mise à jour du Sheet
- Statut → `Généré`, `erreur_pipeline` vidée (main.py:188-189).

### Étape 9 : e-mail de notification (notifier.send_draft_notification)
- Gmail API, de `GMAIL_SENDER` à `GMAIL_RECIPIENT`. Contenu en section 5.

### Nombre d'appels Claude et durée
| Cas | Appels |
|---|---|
| Recherche (si `faits_sources` vide) | 1 conversation agentique (jusqu'à 5 requêtes `pause_turn`), jusqu'à 8 recherches et 12 lectures côté serveur |
| Génération, tentative 1 | 1 (32 000 tokens max) |
| Réécriture de capsules | 0 à 2 × nombre de capsules fautives (observé : 2 à 12 capsules, donc jusqu'à environ 24 petits appels) |
| Relecture de fidélité | 1 si la validation passe |
| Retry (si erreurs) | 1 génération, de nouvelles réécritures et 1 fidélité |

Durée observée (logs/cron.log) : environ **2 minutes** pour un article sans retry (« sécurité pointage mobile » : 10:00:05 → 10:02:01 le 10/11, e-mail compris). Avec un retry, compter environ le double (estimation, pas d'horodatage de fin par article). Les logs montrent régulièrement 1 retry ; deux articles ont fini en `À vérifier` en novembre (contradiction de fidélité le 16/11, erreur persistante le 02/11).

---

## 2. Règles de rédaction données au modèle

Légende :
- **[code]** : un contrôle de validation.py correspondant existe (d'après les noms des fonctions et des messages ; détail dans l'inventaire de validation.py).
- **[avertissement]** : contrôlé, mais non bloquant.
- **[prompt seulement]** : aucun contrôle trouvé dans le code, autant que j'aie pu voir.

### 2.1 System prompt de génération (generator.py:67-69), cité en entier
> Tu es un expert SEO/GEO senior et rédacteur web E-E-A-T spécialisé BTP. Tu rédiges des articles exacts et utiles, optimisés pour Google, les AI Overviews et les LLMs (ChatGPT, Perplexity, Gemini).
> Tu n'inventes jamais un fait, un chiffre, une source, une entreprise ou une personne : un passage plus court mais vrai vaut toujours mieux qu'un passage étoffé par une invention.
> Tu réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans texte avant ou après.

### 2.2 Structure du prompt utilisateur (build_prompt, generator.py:184-294)
Blocs dans l'ordre, séparés par des bandeaux « ═══ » :
1. En-tête : `MOT-CLÉ PRINCIPAL` (« c'est lui que l'introduction définit et que l'article cible »), `CLUSTER THÉMATIQUE` (« contexte uniquement, ne pas le traiter comme mot-clé »), `DATE DE PUBLICATION` (date du jour).
2. Consigne H1 et consigne d'angle.
3. `PLANIFICATION ÉDITORIALE`.
4. `FAITS VÉRIFIÉS (seules données factuelles autorisées)` : `[n] fait — Source : source (année, url)` ; un fait juridique dont la source n'est pas officielle reçoit « ⚠ Source non officielle : n'en cite PAS la référence légale… » (validation.py:155-166).
5. `CAS CLIENT (seul cas réel citable)` ou « (vide) ».
6. `SITEMAP TIM-MANAGEMENT.CO (pour maillage interne thématique)` : une URL par ligne.
7. `ANALYSE CONCURRENTIELLE (structure et questions uniquement)`.
8. `RÈGLE ABSOLUE — ZÉRO FAIT INVENTÉ`.
9. `ÉTAPE 1 — FAN-OUT DES SOUS-REQUÊTES`.
10. `ÉTAPE 2 — RÉDACTION (SEO + GEO)` : introduction, corps, faits de référence sur Tim, FAQ, médias, SEO.
11. `FORMAT JSON DE SORTIE` et `RÈGLES DE SORTIE`.

### 2.3 H1 et angle (generator.py:172-182)
- H1 imposé (colonne G) : « Le H1 est imposé : "<clean_h1>". Utilise-le tel quel dans le champ "title". » Le code l'écrase de toute façon (generator.py:404-405). **[code]**
- Sinon : « Rédige le H1 comme la question exacte que se pose le lecteur, ou la promesse exacte de l'article, avec le mot-clé. Jamais de préfixe du type « Guide complet 2026 : ». » Préfixe interdit **[code]** (check_titles) ; « question ou promesse avec le mot-clé » **[prompt seulement]**.
- Angle imposé : « Angle différenciant imposé : "<angle>". Intègre cet angle dès l'introduction et dans les H2. » **[prompt seulement]**
- Sans angle : « Identifie l'angle différenciant en te basant sur les lacunes des concurrents. » **[prompt seulement]**

### 2.4 Planification éditoriale (_planning_context, generator.py:120-138)
- Mots-clés secondaires : « à couvrir naturellement dans un H2, une capsule ou la FAQ, 1 à 2 fois chacun, jamais de bourrage ». **[prompt seulement]**
- Intention (`INTENT_RULES`, generator.py:113-117) : **[prompt seulement]**
  - TOFU : « Lecteur qui découvre le sujet : définitions, explications, exemples de chantier. Aucun argumentaire produit dans le corps. »
  - MOFU : « Lecteur qui cherche une méthode : étapes, critères, comparaison des approches. Tim Management n'est qu'une option parmi d'autres. »
  - BOFU : « Lecteur qui choisit une solution : critères de choix concrets, comparaison honnête ; aucun prix hors FAITS VÉRIFIÉS. »
- « LIENS INTERNES OBLIGATOIRES (page pilier et maillage prévus) : … » **[code]** (check_internal_linking : « Lien interne obligatoire absent »).
- « MAILLAGE PRÉVU (indication, URL du sitemap uniquement) : <texte de la colonne> ». **[prompt seulement]** (seules les URL résolues deviennent obligatoires)
- « NOTES DE L'ÉDITEUR (consignes de fond ; elles ne lèvent jamais les règles sur les faits, les cas clients et Tim ci-dessous) : <brief> ». **[prompt seulement]**
- « ARTICLES DÉJÀ PUBLIÉS SUR DES SUJETS VOISINS (ne pas traiter leur sujet principal : le résumer en une ou deux phrases et lier l'article) : … ». **[prompt seulement]** (la cannibalisation au niveau du mot-clé est contrôlée avant génération, pas le contenu)

### 2.5 Règle absolue : zéro fait inventé (generator.py:218-228)
- `FACT_RULE` (generator.py:25-29) : « Utilise UNIQUEMENT les faits du bloc FAITS VÉRIFIÉS. S'il est vide : aucun chiffre, aucune statistique, aucune attribution à un organisme, aucun cas client nommé. Une entreprise ou un témoignage ne peut être cité que s'il figure dans CAS CLIENT. » **[code]** (check_facts : chiffres, organismes, attributions, entreprises/personnes, témoignages)
- `NO_EXTRAPOLATION_RULE` (generator.py:33-36) : « Ne jamais généraliser ou déduire une règle à partir d'un fait ; si un fait porte sur un cas précis (une caisse, une région), le présenter comme tel sans extrapoler. » **[code, partiel]** par la relecture de fidélité (appel Claude, pas une règle déterministe) ; le commentaire de generator.py:31-32 dit que ce n'est « pas détectable par la validation ».
- « Chaque chiffre, pourcentage ou attribution (« selon… », « d'après… », « source : », étude, baromètre) doit reprendre un fait du bloc FAITS VÉRIFIÉS, avec sa source telle qu'indiquée. » **[code]**
- « Aucun organisme (FFB, INSEE, CAPEB, OPPBTP, DARES…) n'est nommé s'il n'apparaît pas dans FAITS VÉRIFIÉS. » **[code]** (liste `ORGANISMES` de validation.py)
- « Références légales (article L…/R…, décret, loi, convention collective) : uniquement si FAITS VÉRIFIÉS contient la ligne Légifrance, service-public ou code.travail.gouv.fr correspondante. Sinon, décris la règle sans citer de référence. » **[code]**
- « Chiffre propre à une convention collective (contingent, majoration conventionnelle…) : uniquement s'il figure dans une ligne dont la source est le texte de la convention sur Légifrance. N'écris jamais « dans le BTP » pour une règle qui ne vaut que pour une convention : nomme la convention (ouvriers du bâtiment, travaux publics, ETAM, cadres). » Chiffre **[code]** (check_convention_figures) ; « dans le BTP » **[code, partiel]** par la relecture de fidélité.
- « Montants en euros : uniquement ceux de FAITS VÉRIFIÉS, ou un calcul simple et explicite à partir d'eux (ex. plafond mensuel × 12, SMIC × taux). Un exemple chiffré part d'un montant de FAITS VÉRIFIÉS (SMIC, plafond…), jamais d'un salaire inventé. » **[code]** (montants, exception « Exemple : / Hypothèse : » avec calcul vérifié, README.md:139)
- « Les quantités neutres et évidentes (« 3 étapes », « une fois par semaine ») restent possibles. » (tolérance du code)
- « Signal d'expérience E-E-A-T : uniquement à partir de CAS CLIENT. S'il est vide, décris des situations de chantier génériques (« un conducteur de travaux qui suit plusieurs sites… ») sans nom, sans chiffre, sans résultat inventé. » **[code, partiel]** (entreprises, personnes et témoignages contrôlés ; « résultat inventé » non)

### 2.6 Étape 1 : fan-out (generator.py:230-233)
> Liste 5 à 8 sous-requêtes que poserait un conducteur de travaux ou un dirigeant d'entreprise BTP autour de "<keyword>" (champ "sous_requetes"), puis couvre chacune dans un H2 dédié. Pour chaque sous-requête, "h2" reprend EXACTEMENT le texte du H2 qui la traite.

**[code]** (check_fanout : 5 à 8, chaque `h2` doit exister). Le champ `sous_requetes` n'est pas envoyé à WordPress.

### 2.7 Introduction (generator.py:238-242)
1. TL;DR : « Commence par la TL;DR, exactement sous cette forme, SANS aucun attribut style ni autre attribut : `<div class="tldr-box"><p>Points clés :</p><ul><li>…</li></ul></div>` — 3 à 5 points autonomes. » Bloc et 3 à 5 points **[code]** (check_tldr) ; `style` **[code]** (retiré par sanitize, puis erreur) ; « autonomes » **[prompt seulement]**.
   - `TLDR_NO_PROMOTION_RULE` (generator.py:39-43) : « Aucun point ne promeut un outil, un logiciel, une solution ou une pratique (« le pointage digital renforce… », « un suivi centralisé sécurise… ») : la TL;DR résume les faits de l'article, jamais l'argumentaire produit. Ne mentionne pas Tim Management. » **[prompt seulement]**
2. « Définis "<keyword>" en une phrase claire dans les 100 premiers mots ; mot-clé dans les 50 premiers mots qui suivent la TL;DR. » Mot-clé dans les 50 premiers mots **[code]** (check_keyword_intro) ; définition dans les 100 premiers mots **[prompt seulement]**.
3. « Pose le problème du lecteur (chiffré uniquement avec FAITS VÉRIFIÉS), la promesse de l'article, puis un appel à l'action implicite. » **[prompt seulement]** (sauf chiffres)
4. « Mentionne "Tim Management" une fois, naturellement, jamais de façon publicitaire, en respectant les FAITS DE RÉFÉRENCE SUR TIM ci-dessous. » **[prompt seulement]** (check_brand ne contrôle que la graphie « Tim Management »)

### 2.8 Corps (generator.py:244-254)
- Longueur : avec `wordcount`, « environ N mots (intro, corps, conclusion et FAQ ; ±30 %), jamais de remplissage pour l'atteindre » **[avertissement]** (écart > 30 %) ; sans, « celle que le sujet exige (aucune longueur idéale), sans remplissage ». Minimum dur de 300 mots **[code]** (ARTICLE_MIN_WORDS, jamais dit au modèle).
- « Chaque section est autonome (150 à 300 mots), aucun remplissage, aucune paraphrase. » **[prompt seulement]**
- « Titres : aucun `<h1>` (le H1 est le champ "title") ; chaque bloc commence par son `<h2>` ; `<h3>` uniquement sous un `<h2>`, sans sauter de niveau. » **[code]** (check_headings)
- « Au moins 60 % des H2 sont formulés en question (Comment…, À partir de combien…, Quelle différence…, Faut-il…). » **[code]** (H2_QUESTION_MIN_RATIO = 0.6)
- Capsules : « Chaque H2 est IMMÉDIATEMENT suivi d'une capsule : `<p><strong>…</strong></p>` de STRICTEMENT 40 à 60 mots (compte-les), réponse complète et autonome, compréhensible sans le reste de l'article, sans aucun lien à l'intérieur, qui nomme l'entité en toutes lettres (jamais « il », « elle », « ce dernier », « celui-ci »). » Présence, 40-60 mots, pas de lien, pas de pronom en tête **[code]** (check_capsules et réécriture automatique) ; « complète et autonome » **[prompt seulement]**.
- « La balise `<strong>` est réservée aux capsules (corps et FAQ) : aucun autre `<strong>` dans le contenu ni la FAQ. » **[code]** : corrigé silencieusement par `unwrap_article_strong`, pas d'erreur.
- « Format adapté à chaque section (liste, étapes numérotées, paragraphes courts de 3-4 lignes) ; un vrai `<table>` dès qu'il y a une comparaison ou des valeurs par cas (taux, délais, conventions). » **[prompt seulement]**
- Apport propre : « Apport propre, obligatoire (Google : « original, expert-led content that provides value beyond common knowledge ») : au moins un élément qu'un résumé des sources n'aurait pas, par exemple un exemple chiffré pas à pas calculé uniquement à partir de FAITS VÉRIFIÉS, une check-list ou un arbre de décision propre au chantier, le cas réel de CAS CLIENT s'il existe. Jamais d'expérience, de témoignage ni de citation d'expert inventés. » **[prompt seulement]** (sauf témoignages ; calculs vérifiés s'ils sont présents)
- Maillage interne : « Liens internes : 3 à 5 au total (minimum 3), URL copiées EXACTEMENT depuis le sitemap ci-dessus, dont au moins une page produit ou outil (hors /actualite/ et /contact), pages les plus proches thématiquement, ancre descriptive qui dit ce que contient la page (jamais « ici », « cliquez ici », « en savoir plus », « cet article »). » + « Liens obligatoires : … ». Minimum 3, URL dans le sitemap, au moins une page produit, ancres, liens obligatoires **[code]** ; plus de 5 liens **[avertissement]** ; « pages les plus proches » **[prompt seulement]**.
- Liens sortants : « uniquement vers une page précise présente dans FAITS VÉRIFIÉS, sur les domaines <ALLOWED_OUTBOUND_DOMAINS> ; jamais vers une page d'accueil. Jamais d'URL inventée : en cas de doute, pas de lien. » Domaines autorisés (validation.py:20-28) : legifrance.gouv.fr, insee.fr, service-public.fr, service-public.gouv.fr, urssaf.fr, ffbatiment.fr, code.travail.gouv.fr. **[code]** (domaine et page d'accueil ; d'après le README, une URL présente dans `faits_sources` est aussi acceptée).
- « "Tim Management" 1 à 2 fois maximum dans le corps. Ton expert, accessible, non promotionnel. » **[prompt seulement]**

### 2.9 Faits de référence sur Tim (`TIM_REFERENCE_RULE`, generator.py:47-58), cité en entier
> Faits de référence sur Tim, seuls autorisés : essai « Premier mois offert, sans engagement ». Aucune note, aucun nombre d'avis, aucune étoile (la note est affichée ailleurs, avec le détail par source). Aucun prix, aucun tarif, aucun montant d'abonnement. Aucun pointage hors connexion, aucun mode hors ligne, aucune synchronisation au retour du réseau. Une fonctionnalité de Tim n'est citée que si elle figure sur une page produit de tim-management.co présente dans le sitemap ci-dessus, avec un lien vers cette page, sauf si elle est déjà liée dans l'article, et sans promesse de conformité, de résultat ni de chiffre (jamais « garantit », « fiabilise », « supprime les erreurs », « en 2 clics », « -50 % »). Pour l'appel à l'action, le seul lien autorisé est https://tim-management.co/contact : jamais de lien vers une page de demande de démo (demande-demo-suivi-temps, demande-demo-suivi-temps-v2), qui n'est pas indexée.

Contrôles : note, avis, étoiles **[code]** (check_rating) ; hors ligne **[code]** (check_offline) ; prix et chiffres sans source **[code, indirect]** par check_facts ; fonctionnalité liée à une page produit, verbes de promesse, CTA vers /contact uniquement, pas de page démo **[prompt seulement]** (à confirmer dans l'inventaire de validation.py ; une page démo hors sitemap ferait de toute façon échouer « Lien interne absent du sitemap »).

### 2.10 Concurrents (`COMPETITOR_RULE`, generator.py:61-65)
> Un logiciel ou un éditeur concurrent peut être nommé quand c'est utile au lecteur, sans jamais de lien vers son site (ni dans le texte, ni en source), sans le recommander, et sans rien affirmer sur lui qui ne figure pas dans FAITS VÉRIFIÉS.

Lien vers un concurrent (texte et sources) **[code]** (check_competitor_links, liste `COMPETITOR_NAMES` config.py:67-72 ; Kalitics retiré : partenaire) ; « sans le recommander », « rien d'affirmé hors faits » **[prompt seulement]** (sauf chiffres).

### 2.11 FAQ (generator.py:260-261)
> 3 à 6 vraies questions de lecteurs, distinctes des H2 (aucune question inventée pour remplir) ; chaque réponse commence par une capsule `<p><strong>…</strong></p>` de 40 à 60 mots, même règles que ci-dessus.

Capsule de réponse **[code]** ; nombre 3 à 6 **[prompt seulement]** à la génération (le refresh, lui, impose 4 à 6, generator.py:730-731) ; « distinctes des H2 », « vraies questions » **[prompt seulement]**.
Pas de balisage FAQ JSON-LD produit par le pipeline : le front ou Yoast s'en chargent.

### 2.12 Médias, propositions pour création manuelle (generator.py:263-265)
- « "images" : 2 ou 3 propositions de visuels ; "position_apres_h2" reprend EXACTEMENT un H2 ; "description_visuelle" décrit le visuel à créer ; "alt" est un texte alternatif descriptif. » **[avertissement]** (check_media_proposals)
- « "video" : un titre YouTube et un script oral de 60 à 90 secondes (150 à 220 mots) reprenant les points clés, soumis aux mêmes règles factuelles. » Longueur **[avertissement]** (le code tolère 130 à 250 mots) ; règles factuelles **[code]** (le script est passé à check_facts, README.md:125).
- Aucune image n'est générée ni envoyée à WordPress ; pas d'image mise en avant.

### 2.13 SEO, méta Yoast (generator.py:267-269)
- « yoast_title : mot-clé au début, 60 caractères environ au plus (au-delà, Google tronque l'affichage), unique sur le site. » Vide et mot-clé absent **[code]** ; plus de 60 caractères **[avertissement]** ; « au début », « unique sur le site » **[prompt seulement]**.
- « yoast_description : 155 caractères environ au plus, avec le mot-clé, qui dit ce que la page apporte ; différente du premier point de la TL;DR. » Vide **[code]** ; plus de 155 caractères **[avertissement]** ; mot-clé et différence avec la TL;DR **[prompt seulement]** (à confirmer).

### 2.14 Règles de sortie (generator.py:290-294)
> - JSON valide et parseable directement, sans markdown ni commentaire. **[code]**
> - "faits_utilises" : numéros [n] des FAITS VÉRIFIÉS réellement utilisés ([] si aucun).
> - Un bloc "contenu" par H2 (chaque bloc commence par son <h2>). **[code]** (check_headings, check_capsules)
> - Ne produis AUCUN autre champ : ni "schema_org" (généré par Yoast), ni "sources", ni dates (ajoutés par le pipeline).

Schema.org / JSON-LD : **jamais produit par le pipeline**, généré par Yoast côté WordPress (`yoast_head_json`, wordpress.py:61-63, 127).

### 2.15 Autres contrôles du code jamais formulés dans le prompt
- Traces de génération IA (check_ai_traces : regex `_AI_TRACE_RE`) **[code]**.
- Graphie de la marque « Tim Management » (check_brand) **[code]**.
- Article d'au moins 300 mots **[code]**.

### 2.16 Prompt de réécriture d'une capsule (rewrite_capsule, generator.py:319-347)
System : « Tu es un rédacteur web SEO/GEO rigoureux. Tu n'inventes jamais de fait. » Prompt : « Réécris cette capsule d'article (réponse snippet-ready) sur "<keyword>" », contexte = H2 de la section, problèmes détectés, capsule actuelle. Contraintes : STRICTEMENT 40 à 60 mots, 1 à 3 phrases ; réponse complète et autonome ; aucun lien, aucune balise HTML ; entité nommée en toutes lettres ; FACT_RULE et NO_EXTRAPOLATION_RULE ; FAITS VÉRIFIÉS et CAS CLIENT fournis. « Réponds uniquement par le texte de la capsule, sans guillemets. » Sortie nettoyée et échappée en HTML.

### 2.17 Prompt de relecture de fidélité (build_fidelity_prompt, generator.py:460-482)
System : « Tu es un relecteur factuel et juridique exigeant. Tu compares un article aux faits vérifiés qui lui servent de source et tu ne signales que des contradictions certaines. Tu réponds UNIQUEMENT avec un objet JSON valide, sans markdown. »
Signaler seulement les phrases qui : 1) contredisent un fait (sens inversé, mauvais seuil, délai, taux, condition, bénéficiaire) ; 2) étendent un fait au-delà de ce qu'il dit (convention, caisse, région présentée comme générale ; « dans le BTP » pour une seule convention) ; 3) présentent comme obligatoire ce qui est facultatif, recommandé ou conditionnel, ou l'inverse. Ne pas signaler : le style, une information absente des faits, une reformulation fidèle, une phrase sans rapport, un conseil général. Sortie : `{"problemes": [{"phrase", "fait", "explication"}]}`. L'article est transmis en texte brut (`article_plain_text` : titre, intro, blocs, conclusion, FAQ).

---

## 3. Format de sortie et envoi à WordPress

### 3.1 JSON attendu du modèle (generator.py:274-288)
```json
{
  "sous_requetes": [{"requete": "…", "h2": "Texte exact du H2"}],
  "title": "H1",
  "introduction": "<div class=\"tldr-box\"><p>Points clés :</p><ul><li>…</li></ul></div><p>Définition et problème…</p><p>Promesse…</p>",
  "contenu": [{"acf_fc_layout": "texte", "texte": "<h2>Comment … ?</h2><p><strong>Capsule 40-60 mots.</strong></p><p>…</p>"}],
  "conclusion": "<p>Synthèse, mot-clé, CTA avec lien vers https://tim-management.co/contact.</p>",
  "faq": [{"titre": "Question ?", "text": "<p><strong>Capsule 40-60 mots.</strong> Complément.</p>"}],
  "faits_utilises": [1],
  "images": [{"position_apres_h2": "…", "description_visuelle": "…", "alt": "…"}],
  "video": {"titre": "…", "script": "…"},
  "yoast_title": "…",
  "yoast_description": "…"
}
```
- `contenu` est un **flexible content ACF** : une seule mise en page produite, `acf_fc_layout: "texte"`, un bloc par H2. L'e-mail mentionne une mise en page `video` (url, titre, transcription) à ajouter à la main.
- Conclusion : le CTA vers /contact n'apparaît que dans l'exemple JSON (« appel à l'action vers Tim Management avec un lien vers https://tim-management.co/contact »).

### 3.2 Champs ajoutés par le code (generator._finalize)
`sources` [{libelle, url, date}], `methode` {assistance_ia, note_methode}, `date_mise_a_jour` "", `resume_mise_a_jour` "", `temps_de_lecture` « N min », `_faits_utilises`, `_warnings` (champs internes, non envoyés). `faits_utilises` est retiré ; `sous_requetes`, `images` et `video` restent dans le JSON local et l'e-mail, pas dans WordPress.

### 3.3 Requête WordPress (wordpress.build_payload, wordpress.py:48-93)
- Endpoint : `POST {WP_URL}/wp-json/wp/v2/{WP_POST_TYPE}` (wordpress.py:34-36). `WP_POST_TYPE` vaut `posts` par défaut dans config.py:15, mais les liens observés (`?post_type=actualite&p=7444`) et les commentaires montrent que la variable d'environnement pointe sur la base REST du **CPT `actualite`** (valeur exacte dans `.env`, non lue).
- Auth : Basic Auth avec mot de passe d'application (`WP_USERNAME` / `WP_APP_PASSWORD`).
- Payload :
```json
{
  "title": "<H1>",
  "content": "",
  "status": "draft",
  "author": <ID auteur, défaut 1>,
  "seo_meta": {"title": "<yoast_title>", "metadesc": "<yoast_description>", "focuskw": "<keyword>"},
  "acf": {
    "temps_de_lecture": "9 min",
    "introduction": "<html TL;DR + intro>",
    "contenu": [{"acf_fc_layout": "texte", "texte": "<html>"}],
    "conclusion": "<html>",
    "faq": [{"titre": "…", "text": "<html>"}],
    "sources": [{"libelle": "…", "url": "…", "date": "année"}],
    "methode": {"assistance_ia": true, "note_methode": "…"},
    "date_mise_a_jour": "",
    "resume_mise_a_jour": ""
  },
  "slug": "<dernier segment de la colonne H, ex. /actualite/x → x>",
  "categories": [<ID>]
}
```
- `content` (éditeur natif) est **vide** : tout le contenu passe par l'ACF.
- `status: "draft"` toujours (vérifié par `assert`, wordpress.py:132). Jamais publié.
- `seo_meta` : champ REST personnalisé du plugin **tim-api** (le `meta` standard n'est pas exposé pour le CPT) ; Yoast régénère ensuite `<head>` et schema (`yoast_head_json`), lus par le front headless.
- `slug` : envoyé seulement si la colonne H est remplie.
- `categories` : taxonomie `category` du CPT, IDs par nom normalisé (config.py:28-36) : pointage 58, planning 59, feuilles d'heures 60, suivi de chantier 61, paie & rh 62, fiches metier 63, comparatifs 64. Valeur inconnue : pas de catégorie.
- `methode.relu_par` et `methode.relu_le` ne sont **pas** envoyés : Charlie les remplit avant publication.
- Pas d'image mise en avant, pas d'étiquettes, pas d'extrait.
- Après la réponse : alerte (sans blocage) si `sources`, `methode`, `date_mise_a_jour` ou `resume_mise_a_jour` manquent dans `acf` (plugin pas à jour), ou si l'auteur obtenu diffère de l'auteur demandé (droit `edit_others_posts`). Retour `{id, link}`.
- Dates ACF au format `Y-m-d` (`acf_date`, wordpress.py:17-31) ; tim-api ≥ 1.2.2 convertit.
- `WP_DEBUG=true` affiche le payload et la réponse.

---

## 4. Refresh (refresh.py)

Principe : **toujours en deux temps**. Le script fait des propositions (fichiers + e-mail) ; l'application se fait à la main avec `--apply` après relecture. Le statut de publication n'est jamais modifié.

### 4.1 Modes
| Commande | Rôle |
|---|---|
| `python refresh.py` (cron le 1er du mois à 7h, `logs/refresh.log`) | **Refresh mensuel** : articles publiés depuis plus de 6 mois (`MONTHS = 6`, `list_published_before`, pagination de 100, `context=edit`) **et** présents dans le Sheet (`find_row` : `wp_id`, sinon slug). Sans ligne : ignoré. |
| `--queue FICHIER --mode tldr [--limit N]` | File de reprise (tableau Markdown `` | `slug` | publié le | chiffre sans source | TL;DR manquant | date incohérente | ``, ex. `tim-front/docs/seo/articles-a-reprendre-2026-09-25.md`). Seulement les lignes « TL;DR manquant = oui ». |
| `--queue FICHIER --mode sources [--faits-dir DIR]` | Refresh complet seulement si des faits existent : ligne du Sheet, sinon fichier compagnon `<slug>.faits.txt` (dossier de la file par défaut). Sans faits : listé dans l'e-mail, aucun appel. |
| `--apply WP_ID [--mode tldr]` | Applique la proposition relue. `--mode` est obligatoire si deux propositions existent. |
| `--dry-run` | Liste les articles, sans appel Claude ni écriture. |

`--limit` : les articles déjà dotés d'une TL;DR ou d'une proposition en attente sont ignorés sans compter dans la limite, pour que les lots successifs avancent (refresh.py:333-341).

### 4.2 Mode `sources` / mensuel : construction (`_sources_proposal`, refresh.py:175-218)
1. `post_to_article` (wordpress.py:191-202) : title, introduction, contenu, conclusion, faq, sources depuis l'ACF.
2. Empreinte `facts_fingerprint` = sha256 (16 premiers caractères) de `{faits, cas_client}`.
3. Validation actuelle des **parties régénérables** (TL;DR, capsules du corps, FAQ) : `check_facts` + `check_refresh` (TL;DR 3-5, capsules 40-60, FAQ 4-6 avec capsule).
4. `needs_refresh` : empreinte différente de celle de `state.json` **ou** parties actuelles non conformes. Sinon « unchanged ».
5. `generator.regenerate_refresh_parts` (generator.py:735-799) : **1 appel Claude** (`max_tokens=16000`, system de génération), +1 retry. Prompt : « Actualise un article publié sur "<kw>" : régénère UNIQUEMENT la TL;DR, les capsules et la FAQ. » + FACT_RULE + NO_EXTRAPOLATION_RULE + « Supprime de ces éléments tout chiffre, organisme, référence légale ou entreprise qui ne figure pas dans FAITS VÉRIFIÉS / CAS CLIENT. » Fournis : faits, cas client, TL;DR, capsules (avec leur section) et FAQ actuelles. Contraintes : `tldr_points` 3 à 5 ; `capsules` EXACTEMENT N textes dans le même ordre, 40 à 60 mots, autonomes, sans lien ni HTML, entité nommée, même sujet ; `faq` 4 à 6, chaque `text` commence par `<p><strong>capsule</strong></p>` ; `faits_utilises`. Sortie `{"tldr_points", "capsules", "faq", "faits_utilises"}`. Le code réinjecte (`apply_refresh` : TL;DR remplacée ou ajoutée en tête, capsules remplacées dans l'ordre après chaque `</h2><p>`, FAQ remplacée), puis vérifie (nombre de capsules, check_facts, check_refresh).
6. Pas de différence réelle (texte normalisé identique) : l'empreinte est enregistrée dans state.json et rien n'est proposé.
7. Proposition `output/refresh/<wp_id>.json` : mode, wp_id, title, slug, keyword, `post_modified`, fingerprint, origine des faits, faits, cas_client, faits_utilises, `parts` (tldr_points, capsules, faq) et `violations_corps` (faits non sourcés hors parties régénérées, à corriger à la main dans WordPress).

### 4.3 Mode `tldr` (`_tldr_proposal`, refresh.py:221-244 ; `generate_tldr`, generator.py:616-653)
- Ignoré si l'introduction contient déjà une TL;DR (toute forme, `_ANY_TLDR_RE`).
- 1 appel Claude (`max_tokens=2048`) +1 retry. Prompt : « Rédige la TL;DR (3 à 5 points clés) d'un article déjà publié sur "<kw>". » Règles : uniquement des informations PRÉSENTES dans le contenu, aucun fait, chiffre, exemple ou conseil nouveau ; NO_EXTRAPOLATION_RULE ; TLDR_NO_PROMOTION_RULE ; « Aucun chiffre, pourcentage, montant, organisme ni référence légale, sauf s'il figure dans FAITS VÉRIFIÉS (même s'il apparaît dans le contenu : les chiffres du contenu ne sont pas tous sourcés) » ; chaque point = phrase autonome de 10 à 25 mots, sans lien ni HTML. Sortie `{"tldr_points": [...]}`.
- Contrôle `check_tldr_no_new_facts` : format, check_facts, aucun nombre absent du contenu existant.
- Proposition `output/refresh/<wp_id>.tldr.json` (`tldr_html`).

### 4.4 state.json
`output/refresh/state.json` : `{ "<wp_id>": {"fingerprint": "…", "checked": "AAAA-MM-JJ"} }` (aucune différence réelle) ou `{"fingerprint", "applied": "AAAA-MM-JJ"}` (après `--apply` en mode sources). Il sert à ne retraiter un article que si ses faits ou son cas client ont changé, ou s'il est non conforme. **La date de mise à jour ne bouge jamais sans changement réel.**

### 4.5 `--apply` (refresh.py:364-463)
- Recherche de la proposition (`<id>.json` ou `<id>.tldr.json`).
- **tldr** : relit le post ; refus s'il a déjà une TL;DR ; revalide `check_tldr_no_new_facts` sur le contenu **actuel** ; `update_acf(id, {"introduction": tldr + intro})`. **Aucune date, aucun `resume_mise_a_jour`, aucune source** (modification de forme).
- **sources** : relit le post (message si `modified` a changé, sans blocage) ; refus si le nombre de capsules a changé ; réinjecte les `parts` dans la version **actuelle** (les corrections manuelles du corps sont conservées) ; revalide check_facts, check_refresh et `body_violations` (le corps entier doit être conforme, sinon refus avec la liste à corriger dans WP) ; refus si aucune différence réelle ; reconstruit `sources` et vérifie `check_sources` ; puis `update_acf(id, {introduction, contenu, faq, sources, date_mise_a_jour: aujourd'hui, resume_mise_a_jour: "Chiffres et FAQ actualisés"})`. Met à jour state.json (`applied`).
- `update_acf` (wordpress.py:205-221) : `POST /wp/v2/<type>/<id>` avec `{"acf": {...}}` seulement, **jamais `status`**.
- Succès : la proposition est archivée dans `output/refresh/applied/<stem>_AAAAMMJJ.json`.

### 4.6 E-mail de refresh (notifier.send_refresh_notification, notifier.py:113-149)
Sujet « [SEO Pipeline] Refresh : N proposition(s), M bloqué(s) ». Contenu : nombre d'articles inchangés ; propositions (titre, ID, ce qui change, commande `python refresh.py --apply <id> [--mode tldr]` à copier, « Corps à corriger avant application » le cas échéant) ; bloqués (15 premières erreurs) ; « Non traités faute de faits_sources » (mode queue). Envoyé seulement s'il y a au moins une proposition ou un blocage.

---

## 5. E-mails de notification (notifier.py)

Envoi par la Gmail API (`users.messages.send`, `userId="me"`), MIME HTML, de `GMAIL_SENDER` à `GMAIL_RECIPIENT` (notifier.py:9-18).

### 5.1 « Brouillon prêt » (build_draft_notification, notifier.py:62-86)
- Sujet : `[SEO Pipeline] Brouillon prêt : <mot-clé>`.
- Tableau : mot-clé, titre H1, URL du brouillon, bouton « Voir le brouillon ».
- **« À faire manuellement »** (notifier.py:28-48) :
  - chaque image proposée : « Image i — après le H2 « … » », « Visuel : <description_visuelle> », « Alt : <alt> » ;
  - **vidéo YouTube (60-90 s)** : titre et **script complet** dans un bloc cité, puis « Une fois la vidéo en ligne, ajouter un bloc « video » (url, titre, transcription) dans le contenu. » ;
  - rappel : « Avant publication : remplir methode.relu_par et methode.relu_le, et relire ce que l'IA a produit en plus du texte : title et description Yoast, texte alternatif des images (Google, « Using generative AI content »). »
- **« Chiffres relevés chez les concurrents — à vérifier »** (notifier.py:51-59) : « Non utilisés dans l'article. Pour en utiliser un : vérifier la source primaire, puis l'ajouter à la colonne faits_sources (« fait | source | url | année »). » Puis une liste « phrase — url du concurrent ».
- **Avertissements** : `warnings` de la validation (longueur, méta trop longues, plus de 5 liens internes, médias, montants calculés…) et, en tête, l'avertissement « faits_sources trouvés par la recherche automatique (N faits, chacun vérifié mot pour mot dans la page citée) : relire la colonne faits_sources du Sheet » si la recherche a tourné.
- **Lignes faits_sources ignorées (format invalide)**.

### 5.2 « À vérifier » (send_verification_notification, notifier.py:94-110)
Sujet `[SEO Pipeline] À vérifier : <mot-clé>`. Texte : « Article non publié : validation échouée après retry », « Aucun brouillon WordPress n'a été créé ; le statut du Sheet est « À vérifier ». », pistes (« compléter faits_sources / cas_client, ou ajuster le titre, puis repasser la ligne en « Planifié » »), liste des erreurs (60 au plus), chemin de la sortie brute, chiffres concurrents à vérifier, lignes faits_sources ignorées. Le même e-mail sert pour la cannibalisation, le manque de faits et la divergence de sources.

---

## 6. Fiches métier (pipeline indépendant)

Fichiers : `main_metiers.py`, `metiers_sheet.py`, `metiers_generator.py`, `metiers_wordpress.py`, `francetravail.py`. Cron : `0 10 * * 2,5 … main_metiers.py --write` (mardi et vendredi à 10h, `logs/metiers_cron.log`).

- **Sheet** : onglet `METIERS_SHEET_NAME` (défaut « Fiches Métier »), même spreadsheet, lecture par en-têtes : Statut, Métier, Code ROME, Slug, Date publication, Catégorie, salaires médians (tous âges, moins de 35 ans, 35 ans et plus), fourchette des offres (min, max, part %), offres sur 12 mois, demandeurs, tension de recrutement, date des données, URL de la fiche. Statuts `À générer` → `Généré` / `Erreur` (mise en forme conditionnelle des couleurs). L'onglet est créé s'il manque (`ensure_sheet`).
- **Chiffres** : le Sheet prime ; les cases vides sont complétées par l'**API France Travail** (« Marché du travail », stats-offres-demandes-emploi v1, et « Offres d'emploi » v2 pour la fourchette des salaires ; OAuth2 client_credentials, `FT_CLIENT_ID` / `FT_CLIENT_SECRET`, facultatif). Les chiffres récupérés sont réécrits dans le Sheet. Lien de référence dataemploi.francetravail.fr par code ROME.
- **Claude** : `metiers_generator.generate_editorial`, 1 appel `messages.create` (sans streaming), `max_tokens=8000`, sans outils ni thinking, sans validation automatique ni retry. System : expert orientation et métiers du BTP, rédacteur E-E-A-T, diplômes et certifications RÉELS, JSON seul. Règles : n'inventer aucun chiffre (seulement ceux fournis) ; définition et réponses FAQ « snippet-ready » de 40 à 60 mots, autoportées ; entités liées ; « Tim Management » une fois au plus ; texte brut sans HTML. Sortie : titre épicène, catégorie, définition, synonymes (2-5), points clés (4-5), textes d'introduction, certifications (4-6 : intitulé, niveau, durée), groupes de compétences (savoir-faire, savoir-être), contextes de travail (4-6), **quiz d'orientation** (5 questions × 4 options notées 3/2/1/0, 3 paliers de résultat), FAQ (5-6), yoast_title (60 caractères) et yoast_description (155).
- **Assemblage** : `build_acf` (main_metiers.py) construit l'objet ACF complet (répéteurs `{valeur: …}`) et `build_seo_meta`.
- **WordPress** : CPT `metier`, REST `/wp/v2/<WP_METIER_REST_BASE>` (défaut `metiers`). **Upsert idempotent par slug**, et **`status: "publish"` directement** (pas de brouillon, contrairement aux articles). Payload `{title, slug, status, acf, seo_meta}`, puis `verify(slug)` relit acf et seo_meta. Timeout 60 s.
- Options : dry-run par défaut, `--write`, `--slug`, `--limit`, `--force` (régénère les lignes déjà `Généré`).

---

## 7. Points à porter avec soin

### Durées et limites
- Génération : un seul appel de 32 000 tokens en **streaming** (pour éviter les timeouts HTTP). Environ 2 minutes par article sans retry, à peu près le double avec retry. La recherche agentique ajoute probablement plusieurs minutes (jusqu'à 8 recherches, 12 lectures de 30 000 tokens chacune, `pause_turn` à relancer jusqu'à 5 fois). Dans Payload, à exécuter dans une **tâche de fond ou une file d'attente** (pas dans une requête HTTP ni une fonction serverless courte), avec un statut visible sur la fiche.
- Les articles sont traités séquentiellement ; un article dû peut en suivre un autre dans la même exécution (2 articles le 10/11).
- Le nombre d'appels de réécriture de capsules n'est pas borné globalement (2 × capsules fautives, par tentative).

### Retries et gestion d'erreurs
- 1 retry de génération (même conversation, avec erreurs et faits non utilisés) ; 2 essais par capsule ; 1 retry pour le refresh et pour la TL;DR ; la relecture de fidélité tourne à chaque tentative.
- `max_tokens` atteint ou `refusal` : exception, statut remis à `Planifié` (ré-essayé le lendemain : risque de boucle quotidienne coûteuse si l'erreur se répète).
- Exception non gérée (WordPress en 4xx/5xx, Sheets, Gmail) : statut remis à `Planifié`, sans e-mail. Si WordPress a réussi mais que Gmail échoue après, le statut repasse quand même en `Planifié` alors qu'un brouillon existe : **risque de doublon de brouillon** (main.py:235-246, le statut est remis même après création du brouillon).
- Pas de verrou : deux exécutions simultanées pourraient traiter la même ligne (le statut `En cours` est posé après la recherche).
- Le scraping des concurrents et le sitemap ne bloquent jamais (liste vide en cas d'erreur). Un sitemap vide rend néanmoins le maillage impossible, donc la validation échoue.
- Relecture de fidélité illisible : ignorée (on ne bloque pas).
- Refresh `--apply` : contrôle de concurrence simple (`post_modified`, nombre de capsules), revalidation complète du corps.

### Dépendances externes
- API Anthropic (Messages API en streaming ; outils serveur `web_search_20250305` et `web_fetch_20250910` ; `thinking: adaptive`). Avertissements du SDK 0.91 sur les blocs web_fetch non typés (research.py:96-100) : la vérification lit `model_dump()` brut, donc la structure exacte de `web_fetch_tool_result` (`content.content.source.data`) est à reproduire en TS.
- Google Sheets API v4 et Gmail API (OAuth utilisateur, token local rafraîchi par `auth.py`). Avec Payload, le Sheet est remplacé par la collection d'articles ; l'e-mail peut passer par un autre canal.
- WordPress REST (CPT `actualite`) + ACF + plugin **tim-api** (champ REST `seo_meta`, conversion des dates) + Yoast (schema et head).
- Sitemap public `https://tim-management.co/sitemap.xml`.
- Sites concurrents et officiels : **en-têtes de navigateur obligatoires** (Urssaf et BOSS coupent sinon) et repli **curl** (Légifrance refuse `requests` sur l'empreinte TLS). En Node, `fetch`/undici aura probablement le même problème d'empreinte TLS : prévoir un repli équivalent.
- France Travail (fiches métier seulement, facultatif).
- Données de référence codées en dur à reprendre : `RESEARCH_DOMAINS`, `ALLOWED_OUTBOUND_DOMAINS`, `COMPETITOR_NAMES`, `CATEGORY_IDS_BY_NAME`, `AUTHOR_IDS_BY_NAME`, `INTENT_RULES`, `TIM_REFERENCE_RULE`, `NOTE_METHODE`, `RESUME_MISE_A_JOUR`.

### Secrets et configuration (noms seulement)
`ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `SPREADSHEET_ID`, `SHEET_NAME`, `METIERS_SHEET_NAME`, `GOOGLE_CREDENTIALS_PATH`, `GOOGLE_TOKEN_PATH` (fichiers dans `credentials/`), `WP_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`, `WP_POST_TYPE`, `WP_METIER_REST_BASE`, `WP_DEBUG`, `GMAIL_SENDER`, `GMAIL_RECIPIENT`, `FT_CLIENT_ID`, `FT_CLIENT_SECRET`.

### Points de fond à garder
- **Les chiffres des concurrents ne vont jamais au modèle** ; seulement à l'humain.
- Les faits sont **la seule source de chiffres** ; la recherche automatique est vérifiée par le code (extrait mot pour mot dans la page réellement lue, nombres inclus dans l'extrait). Ce mécanisme est le cœur de la fiabilité.
- Brouillon seulement, jamais de publication directe pour les articles (alors que les fiches métier sont publiées directement).
- `relu_par` et `relu_le` restent vides : la relecture humaine est une étape explicite.
- Le refresh ne change jamais la date sans changement réel ; il travaille toujours en proposition puis application, sur la version en ligne.
- Écarts entre la documentation et le code : le README (ligne 109) et le crontab disent qu'un article sans faits est ignoré, alors que le code lance la recherche ; `WP_POST_TYPE` vaut `posts` par défaut alors que la production utilise le CPT `actualite` ; FAQ 3-6 à la génération contre 4-6 au refresh ; script vidéo 150-220 mots dans le prompt contre 130-250 dans le code ; `skipped_count` est un compteur mort.
