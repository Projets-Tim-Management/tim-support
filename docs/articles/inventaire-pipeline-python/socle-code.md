# Étape 0 — Socle « vérifié par le code » du pipeline tim-management

Source : `/Users/charliepiancatelli/claude/tim-management` (lecture seule, état du 18/11/2026).
Fichiers lus en entier : `validation.py` (1 325 lignes), `research.py`, `config.py`, `tests/test_validation.py`, `tests/test_research.py`, `tests/conftest.py`. Lus en partie, pour les points où ils appellent la validation : `generator.py`, `main.py`, `sheets.py`, `refresh.py`, `wordpress.py`, `scraper.py`, `tests/test_modules.py`, `tests/test_refresh_queue.py`.

Convention : **ERREUR** = bloquant (une relance avec les erreurs, puis statut « À vérifier », pas de brouillon). **AVERT.** = avertissement, non bloquant (repris dans l'e-mail). `v.py:N` = `validation.py`, ligne N.

---

## 0. Vue d'ensemble : où et quand les contrôles tournent

### 0.1 Ordre dans `main.process_article` (main.py:73-206)
1. **Cannibalisation** (`v.cannibalization_conflicts`) sauf si la colonne `cannibalisation_validee` est remplie → ERREUR, statut « À vérifier », **aucune génération** (main.py:80-88).
2. Si `faits_sources` est vide → **recherche automatique** (`research.research_facts`). Si moins de `MIN_FAITS` = 4 faits retenus → « À vérifier », avec les 10 premiers rejets (main.py:89-102). Sinon la cellule du Sheet est réécrite (`format_cell`).
3. **Divergences conventionnelles** (`v.convention_divergences(faits)`) → ERREUR, « À vérifier », **aucune génération** (main.py:103-107).
4. Génération + `_finalize` + relecture de fidélité (LLM), 1 relance, sinon `ValidationFailed` → « À vérifier » (main.py:138-156).
5. Contrôle de dernier recours : `v.check_sources(article)` revérifié juste avant l'écriture (main.py:160-162).
6. Brouillon WP (`status` forcé à `draft`, `assert` dans wordpress.py:132), statut « Généré », colonne erreur vidée.

### 0.2 Pipeline `generator._finalize` (generator.py:396-424)
`parse_json_response` → `sanitize_article` (retire tous les `style=`, normalise `class='tldr-box'`) → `unwrap_article_strong` (retire les `<strong>` qui ne sont pas des capsules) → H1 remplacé par `clean_h1(titre_h1 du Sheet)` s'il existe → `fix_capsules` (réécriture LLM, jusqu'à 2 essais par capsule fautive) → **`validate_article`** → `sources` construit avec `build_sources(faits, utilisés détectés ∪ déclarés)` → **`check_sources`** → **`check_competitor_links(include_sources=True)`** (seules les lignes `[sources]`) → `methode`, `temps_de_lecture` = mots/230 arrondi, minimum 1 min.
Si aucune erreur : **relecture de fidélité** (`check_fidelity`, LLM, generator.py:485) : ses retours sont des ERREURS (relance). Une réponse illisible est ignorée (pas de blocage).
Relance : 1 seule (generator.py:551-567), message avec 40 erreurs au plus + la liste des faits non utilisés (`unused_facts` → `fact_usage`).

### 0.3 `validate_article` (v.py:1241-1277), ce qu'elle agrège
- **Toujours** (création et reprise) : `check_facts` (sur `article_texts` avec médias), `check_links`, `check_capsules`, `check_titles`, `check_tldr`, `check_fanout`, `check_offline`, `check_rating`, `check_brand`, `check_headings`, `check_ai_traces`, `check_competitor_links` (sans les sources) → ERREURS. Avertissements : montants calculés (`check_facts`), liens internes > 5 (`check_links`), `check_media_proposals`.
- **Seulement si `seo` est fourni** (génération d'un nouvel article, pas le refresh) : `check_seo_meta`, `check_keyword_intro`, `check_length`, `check_internal_linking` → ERREURS + AVERT. (titre/description longs, écart à la longueur cible).
- Erreurs non dédoublonnées entre fonctions ; `check_facts` dédoublonne les siennes (`dict.fromkeys`).
- Test : `test_controles_seo_seulement_a_la_generation`, `test_article_valide_complet`, `test_regression_article_audite`, `test_medias_avertissements_non_bloquants`.

### 0.4 Champs contrôlés (`article_texts`, v.py:1218-1238)
Ordre et libellés d'emplacement : `H1` (title), `yoast_title`, `yoast_description`, `introduction`, `bloc i` (contenu[i].texte, i à partir de 1), `conclusion`, `FAQ i question` (titre), `FAQ i réponse` (text) ; si `include_media` : `vidéo titre`, `vidéo script`, `image i` (= `description_visuelle + ". " + alt`).
`include_media=False` pour `check_competitor_links`, `check_headings`, `internal_links`. `check_links` utilise sa propre liste (introduction, conclusion, blocs, réponses FAQ ; ni H1 ni yoast ni médias).

---

## 1. Primitives de normalisation (à porter à l'identique : toutes les règles en dépendent)

| Fonction | v.py | Comportement exact |
|---|---|---|
| `strip_tags` | 64 | remplace toute balise `<[^>]+>` par **un espace**, PUIS `html.unescape` (entités HTML5 nommées et numériques). L'ordre compte : `&lt;b&gt;` devient du texte `<b>` et n'est pas retiré. |
| `norm` | 68 | unescape → `’`→`'`, NBSP ` ` et ` `→espace → **NFKD** → suppression des caractères `combining` → espaces multiples→1, trim, **minuscules**. Effets NFKD : `²`→`2`, `ﬁ`→`fi`, `½`→`1⁄2` ; `œ`/`æ` **restent** (pas de décomposition). |
| `_compact` | 77 | `norm` → tirets U+2010-2013 → `-` → supprime espaces ET points → `conventions?collectives?` → `conventioncollective`. Ex. « Art. L. 3121-4 » → `artl3121-4` (vérifié ; la docstring dit à tort `art.l3121-4`). |
| `extract_numbers` | 85-93 | regex `\d+(?:[   ]\d{3})*(?:[.,]\d+)?` ; supprime les séparateurs de milliers (espace, NBSP, espace fine), virgule→point, et si décimal retire les zéros puis le point de fin (`4,20`→`4.2`, `3.0`→`3`). Les années comptent (`2024`). Résultat = ensemble de chaînes. Test : `test_extract_numbers` (« 72 %, 1 800 mots, 4,20 € et 2024 » → {72, 1800, 4.2, 2024}). |
| `word_count` | 96 | `len(strip_tags(x).split())` : découpe sur tout blanc Unicode ; « 25 % » = 2 mots, « 1 800 » = 2 mots. |
| `split_sentences` | 100-120 | `</td>`/`</th>` → ` ; ` (une ligne de tableau = une phrase) ; `<br>` et `</p> </li> </h1-6> </div> </tr>` → saut de ligne ; strip_tags ; NBSP→espace. Par ligne : coupe après `.!?…` suivi d'espaces SI le caractère suivant est `[A-ZÀ-ÝÉÈ«"(]`. Ne coupe pas si le tampon finit par `M.`, `Mme.`, `Dr.`, `art.`, `Art.`, `n°.` (regex `\b(M|Mme|Dr|art|Art|n°)\.$`). Test : `test_split_sentences_civilite`. |
| `_norm_url` | 921 (et research.py:128, copie) | trim → coupe au `#` → retire les `/` finaux → **minuscules sur toute l'URL** (chemin compris). |
| `is_homepage_url` | 125 | chemin (urlparse) vide ou `/` après strip des `/` → page d'accueil. La query est ignorée (`/?x=1` = accueil). Test : `test_is_homepage_url`. |
| `_host_in(url, domains)` | 401 | hostname en minuscules égal au domaine ou se terminant par `"." + domaine`. Pas d'hôte → False. Test : `test_source_legale_refusee_domaine_imite` (`legifrance.gouv.fr.example.com` refusé). |
| `parse_json_response` | 1313 | retire les blocs ```json…``` ; sinon prend du premier `{` au dernier `}` ; `ValueError` si aucun. Tests : `test_parse_json_response*`. |

---

## 2. Faits et sources

### 2.1 `parse_faits_sources` — format de la cellule Sheet (v.py:130-152)
- Une ligne par fait : `fait | source | url | année`. `\r`→`\n`. Puce de tête retirée (`-`, `•`, `*`). Lignes vides ignorées.
- **Ligne invalide** si : moins de 2 ou plus de 4 champs ; `fait` ou `source` vide ; `url` présente mais ne commençant pas par `http://`/`https://` ; `url` = page d'accueil.
- Année non validée ici (texte libre). URL et année facultatives.
- Les lignes invalides ne bloquent pas : elles sont listées dans le log et l'e-mail (`faits_invalides`).
- Test : `test_parse_faits_sources_lignes_valides_et_invalides` (4 invalides), `test_parse_faits_sources_vide`, `test_cellule_relue_par_le_sheet`.

### 2.2 `build_sources` — champ ACF `sources` (v.py:174-190)
- Uniquement à partir des faits utilisés (indices détectés par `check_facts` ∪ indices déclarés `faits_utilises` par le modèle, en base 1 → base 0 : generator.py:427).
- Tri par indice ; indice hors bornes ignoré ; fait sans URL ou avec URL d'accueil → aucune ligne ; dédoublonnage sur `_norm_url`, **le premier libellé est gardé**. Sortie `{libelle: source, url, date: annee}`.
- Tests : `test_build_sources_uniquement_depuis_faits_et_dedoublonne`, `test_build_sources_sans_url_ou_accueil_aucune_ligne_et_dedoublonne_sur_url`, `test_generate_article_sources_depuis_faits` (test_modules).

### 2.3 `check_sources` — garde-fou « un chiffre cité ⇒ au moins une source précise » (v.py:193-235) — ERREUR
- Texte examiné : introduction + `contenu[].texte` + conclusion (**pas la FAQ, pas le H1, pas les médias**), après :
  1. suppression des numéros d'étape ou de liste sur le HTML brut : `_NUMERO_ETAPE_RE` = `(?:(?<=>)|^)\s*\d{1,2}\s*[.)]\s` (numéro de 1-2 chiffres juste après une balise ou en début de champ, suivi de `.` ou `)` puis d'un blanc) **ou** `\b[ée]tapes?\s+(?:n°\s*)?\d{1,2}\b` ;
  2. strip des balises ;
  3. suppression des années seules : `_ANNEE_SEULE_RE` = `(?<![\d.,])\b(?:19|20)\d{2}\b` non suivie de `%`, `€`, `euro(s)`, ni d'un chiffre (avec `.`/`,` éventuel).
- Déclencheur `CITE_UN_CHIFFRE_RE` = n'importe quel chiffre `\d`, ou `selon`, ou `d'après` (apostrophe droite, `’`, `&#8217;` ou `&rsquo;`), insensible à la casse.
- Si déclenché : il faut au moins une entrée de `article.sources` dont l'URL commence par `http` et n'est pas une page d'accueil. Sinon une erreur unique : « Sources : le corps cite un chiffre mais le repeater `sources` est vide ou ne contient que des pages d'accueil ».
- Appelé 3 fois : `_finalize` (generator.py:417), juste avant le brouillon (main.py:160) et `refresh._apply_sources` (refresh.py:436).
- Tests : `test_garde_fou_chiffre_sans_source_precise_bloque`, `…_avec_source_precise_passe`, `…_annee_ou_numero_d_etape_passe` (« En 2026, … », « <h3>1. Définir », « 2) », « Étape 3 : »), `…_vrai_chiffre_toujours_bloque` (« 2026 € », « 1 607 heures », « <h3>1. Prévoir 10 heures », « Selon l'Insee »), `…_sans_chiffre_passe`, `test_process_article_chiffre_sans_source_aucun_brouillon` / `…_avec_source_cree_le_brouillon` (test_modules).

### 2.4 `check_facts` — anti-invention, phrase par phrase (v.py:555-682) — ERREUR (+ AVERT. montants calculés)
Entrée : liste `(emplacement, html)`, `faits`, `cas_client`, liste `warnings` facultative. Sortie : (erreurs dédoublonnées, indices des faits utilisés).
Préparation par fait : `_fact_haystack` = `fait + source + annee` (v.py:397) → nombres (`fact_nums`) et version normalisée (`fact_hay_n`) ; mots de contexte `fact_words` = `_content_words(fait + source)` (**sans l'année**) ; `calc_amounts` = tous les montants en € des faits ; `calc_rates` = tous les % des faits ; faits « légaux » = URL sur `LEGAL_SOURCE_DOMAINS` ; `legal_hay` = `_compact(fait + source + url)`.

Pour chaque fragment :
- **Ancres de liens internes** (href commençant par `/` ou dont l'hôte contient `tim-management.co`) : leur texte est retiré de la phrase **pour la seule règle des références légales** (v.py:578-584, 592-594). Le texte d'un lien externe reste contrôlé.
- `hypothesis_amounts(html)` → montants admis par phrase + erreurs « Calcul faux » (voir 2.6).
- Puis pour chaque phrase (`split_sentences`) :

**(1) Références légales** (v.py:591-607). `_LEGAL_PATTERNS` (v.py:466-475), cherchés sur le texte brut de la phrase (hors ancres internes), insensibles à la casse :
| Motif | Jeton |
|---|---|
| `\barticles?\s+([LRD])\s?\.?\s?(\d+(?:[-‑]\d+)*)` | lettre en minuscule + numéro (`l3171-4`) ; seul le 1er article d'une plage « D3141-12 à D3141-20 » est extrait |
| `\bd[ée]cret\s+(?:n\s?[°o]\s*)?(\d{2,4}-\d+)` | n° du décret |
| `\bd[ée]cret\b` | `decret` (abandonné si un jeton numérique existe déjà dans la phrase) |
| `\bloi\s+n\s?[°o]\s*(\d{2,4}-\d+)` | n° de loi |
| `\bconventions?\s+collectives?\b` | `conventioncollective` |
| `\barr[êe]t[ée]\s+du\s+\d` | `arrete` |
Chaque jeton (compacté) doit être une **sous-chaîne** de `legal_hay` d'un fait légal. Sinon : « Référence légale sans ligne Légifrance/service-public correspondante ». Un fait sans URL n'est jamais légal, même étiqueté « Légifrance ».
Tests : `test_reference_legale_sans_ligne_legifrance_rejetee`, `…_avec_ligne_legifrance_acceptee` (« article L. 3171-4 »), `…_non_correspondante_rejetee`, `test_convention_collective_exige_ligne_officielle`, `test_reference_legale_source_non_officielle_rejetee`, `test_reference_legale_source_cibtp_toujours_rejetee`, `test_convention_collective_pluriel_couverte_par_ligne_legifrance`, `test_texte_de_lien_n_est_pas_une_reference_legale`, `test_reference_legale_hors_lien_toujours_controlee`, `test_lien_vers_un_article_de_loi_ne_dispense_pas…`, `test_texte_de_lien_externe_reste_une_citation_controlee`, `test_code_travail_numerique_lien_et_reference_legale_acceptes`, `test_ligne_sans_url_jamais_source_legale`, `test_source_legale_acceptee_par_domaine`.

**(2) Organismes nommés** (v.py:609-624). `ORGANISMES` (v.py:31-35) : FFB, Fédération française du bâtiment, INSEE, CAPEB, OPPBTP, FNTP, DARES, Xerfi, Statista, ADEME, Banque de France, Observatoire des métiers du BTP. Recherche sur la phrase normalisée avec bornes `(?<![\w-])…(?![\w-])`. Chaque organisme doit apparaître (mêmes bornes) dans `fact_hay_n` d'au moins un fait ; équivalence FFB ↔ « federation francaise du batiment » (recherche du terme alternatif en simple sous-chaîne). Sinon : « Organisme « X » cité sans ligne faits_sources » et `org_ok = False`.
Tests : `test_cas_audit_ffb_sans_faits_rejete`, `test_ffb_nom_long_equivaut_acronyme`, `test_organisme_seul_sans_chiffre_rejete`, `test_pourcentage_attribue_organisme_absent_rejete`.

**(3) Chiffres** (v.py:626-662).
- `_PERCENT_RE` (v.py:451) : `(\d+(?:[.,]\d+)?)\s?(?:%|pour ?cents?\b)` → toujours des chiffres à sourcer.
- `_ATTRIBUTION_RE` (v.py:453-460) : la phrase est « attribuée » si elle contient :
  a. `selon` / `d'après` (insensible à la casse) + article facultatif (`le la les l' un une des du son sa leur`) + **une MAJUSCULE** `[A-ZÀ-Ý]` (sensible à la casse : « selon la taille » n'est pas une attribution, « selon l'Insee » l'est) OU un mot `étude(s) enquête(s) baromètre(s) sondage(s) rapport(s) chiffres statistiques donnée(s)` ;
  b. `source(s) :` (avec parenthèse facultative) ;
  c. `baromètre(s)` ou `sondage(s)` n'importe où ;
  d. `une|l'|cette|la dernière|d'après une|selon une` + `étude|enquête`, **sauf** si suivi de « de sol / faisabilit / prix / terrain / chantier / march ».
- Si attribuée : **tous** les nombres de la phrase (années comprises) sauf ceux des montants en € deviennent des chiffres à sourcer.
- `_cover_numbers` (v.py:538-552) : chaque nombre doit figurer dans `fact_nums` d'un fait qui partage **au moins un mot de contexte** avec la phrase (`_content_words`). Plusieurs faits peuvent couvrir une même phrase. Un seul nombre non couvert ⇒ la phrase entière est en erreur « Chiffre absent de faits_sources (…) » — sauf si une erreur d'organisme a déjà été levée pour la phrase (`org_ok`).
- `_content_words` (v.py:529-535) : `norm`, mots `[a-z]+` de ≥ 3 lettres, hors mots vides, singulier approximatif (mot de plus de 4 lettres finissant par `s`/`x` → dernière lettre retirée), + alias `federation francaise du batiment` → `ffb`. **Attention : voir « Points fragiles » n° 1 sur la liste de mots vides réellement utilisée.**
- **Attribution vague** (attribuée, sans chiffre, sans organisme, sans référence légale) : il faut un fait dont un mot de la source (≥ 3 lettres, normalisé) est un **jeton exact** de la phrase normalisée découpée sur les espaces. Sinon : « Attribution sans source fournie dans faits_sources ».
- Tests : `test_pourcentage_sans_fait_rejete`, `test_fait_present_accepte_et_marque_utilise`, `test_quantites_neutres_tolerees` (« 3 étapes », « 35 h », « selon la taille… 2 à 3 jours » acceptés), `test_attribution_vague_rejetee`, `test_etude_de_sol_non_consideree_comme_attribution`, `test_phrase_combinant_deux_faits_acceptee`, `test_phrase_combinee_taux_reduits_acceptee`, `test_nombre_d_un_fait_detourne_hors_contexte_rejete`, `test_combinaison_avec_un_nombre_inconnu_rejetee`, `test_pluriel_compte_comme_contexte`, `test_script_video_soumis_aux_faits`.

**(3 bis) Montants en euros** (v.py:634-647), toujours à sourcer, attribués ou non.
- `_EURO_RE` (v.py:414) : nombre (milliers séparés par espace/NBSP/espace fine, décimales `.`/`,`) + `\s?` + `€` | `euro(s)` | `EUR` (insensible à la casse). Les montants sont extraits **un par un** (`_join_numbers`, v.py:446 : « 48 060 € … 220 € » ne donne pas 48060220).
- Ordre d'acceptation :
  1. montant admis par `hypothesis_amounts` pour cette phrase (tolérance ± 0,005) → ignoré ;
  2. `_euro_direct` : un fait contient ce montant **à ± 0,50 € près** ET partage un mot de contexte → accepté, fait marqué utilisé ;
  3. `_euro_derived` (v.py:431-443) : montant = (montant des faits × taux % des faits / 100) ou (montant × ou ÷ 12, 52, 35, 151,67) ou (montant ± autre montant des faits), à ± 0,50 € → **AVERT.** « Montant calculé à partir de faits sourcés, à vérifier » ;
  4. sinon ERREUR « Montant en euros absent de faits_sources (N €) ».
- `CALC_CONSTANTS` (v.py:417) = 12, 52, 35, 151,67, 100 (100 exclu des multiplications/divisions directes).
- Tests : `test_euro_source_accepte`, `test_euro_arrondi_accepte` (1 823 pour 1 823,03), `test_euro_invente_rejete`, `test_euro_calcule_depuis_faits_avertissement` (236,99 = 1 823,03 × 13 %), `test_euro_salaire_d_exemple_invente_rejete`, `test_euro_hors_contexte_rejete` (220 € hors contexte), `test_validate_article_remonte_les_avertissements_euros`, `test_montants_multiples_non_recolles`, `test_plafond_annuel_calcule_est_un_calcul`.

**(3 ter) Chiffres conventionnels** (v.py:664-669, logique v.py:238-327) : voir 2.5.

**(4) Entreprises et personnes** (v.py:671-676). `_ENTITY_PATTERNS` (v.py:478-498), sur la phrase brute, avec `_CAP` = `[A-ZÀ-Ý][\w'’-]+` (mot à majuscule) :
1. `SARL|SAS|SASU|EURL|SCOP|SNC` + mot(s) à majuscule ;
2. mot(s) à majuscule + `SARL|SAS|SASU|EURL|SCOP` ;
3. `Maçonnerie|Menuiserie|Plomberie|Électricité|Charpente|Couverture|Peinture|Terrassement|Construction(s)|Rénovation|Établissements|Ets|Groupe|Entreprise` (sensible à la casse) + mot(s) à majuscule ;
4. (déclencheur insensible à la casse) `l'entreprise|la société|le groupe|chez|l'artisan|le cabinet` + mot(s) à majuscule ;
5. `M.|Mme|Monsieur|Madame` + 1 ou 2 mots à majuscule ;
6. `Prénom Nom, ` + fonction (`dirigeant(e) gérant(e) conducteur conductrice chef directeur directrice fondateur fondatrice responsable président(e) artisan`).
Autorisé (`_entity_allowed`, v.py:506) si, après `norm`, retrait du déclencheur (`l'entreprise la societe le groupe chez l'artisan le cabinet m. mme monsieur madame`) et coupe à la première virgule : contient `tim management` (`BRAND_ALLOWLIST`), OU est une sous-chaîne de `cas_client` normalisé, OU une sous-chaîne de la `source` normalisée d'un fait. Sinon : « Entreprise/personne « X » absente de CAS CLIENT ».
Tests : `test_entreprise_inventee_rejetee`, `test_entreprise_presente_dans_cas_client_acceptee`, `test_personnes_et_entreprises_hors_cas_client_rejetees` (5 cas), `test_marque_tim_management_autorisee`.

**(5) Témoignage** (v.py:678-680) : si `cas_client` est vide et que la phrase normalisée contient `temoigne|temoignent|temoignage|nous confie|confie-t-il/elle|raconte-t-il/elle|explique-t-il/elle|souligne-t-il/elle|selon son (dirigeant|gerant|president)` (`_TESTIMONIAL_RE`, v.py:500) → ERREUR. Test : `test_temoignage_sans_cas_client_rejete`.

### 2.5 Chiffres de convention collective (v.py:238-327)
- **Sujet d'un fait** (`fact_topic`, v.py:255) : `[sujet]` en tête de la colonne fait, normalisé (« [contingent bâtiment] 265 heures… » → `contingent batiment`).
- **Texte de convention** (`is_convention_text_fact`, v.py:261) : URL sur `legifrance.gouv.fr` (ou sous-domaine) ET (chemin commençant par `/conv_coll/` (en minuscules) OU identifiant KALI `kali(cont|arti|text|scta)\d+` dans chemin+query, insensible à la casse). Le libellé ne compte pas. Tests : `test_texte_convention_accepte_sur_legifrance` (dont `affichIDCC.do?idConvention=KALICONT…`), `test_texte_convention_refuse_hors_legifrance_ou_hors_convention`.
- **Synthèse officielle** (`is_official_synthesis_fact`, v.py:270) : URL sur `code.travail.gouv.fr`, `service-public.fr`, `service-public.gouv.fr`, `travail-emploi.gouv.fr`. Tests : `test_synthese_officielle_acceptee_par_domaine`, `…_refusee_domaine_imite_ou_sans_url`.
- **Quantités** (`_QUANTITY_RE`, v.py:244) : nombre (décimale facultative) + `h`, `heure(s)`, `%`, `jour(s)`, `mois`, `ans`, `années`, `semaine(s)`, `salarié(e)s`. Les numéros d'article, de décision et les années seules ne sont pas des quantités.
- **`check_convention_figures(phrase, faits)`** (v.py:304) — ERREUR « Chiffre conventionnel sans le texte de la convention sur Légifrance » :
  - ne s'applique que si la phrase, **après suppression des formules de réserve** (`_RESERVE_RE`, v.py:250 : `sauf` / `à défaut de` + `disposition(s)|stipulation(s)|précision(s)|accord(s)|clause(s)` + `conventionnel(le)(s)|collectif(s)|contractuel(le)(s)` facultatif + `contraire(s)`), contient `_CONVENTION_RE` (v.py:240) : `convention(s) collective(s)`, `conventionnel(le)(s)`, `accord(s) national|nationaux|de branche`, `avenant(s)`, `idcc` ;
  - chaque quantité doit figurer dans les quantités d'un fait « texte de convention », ou d'une synthèse officielle **dont le [sujet] est aussi celui d'un fait texte de convention** (divergence déclarée).
  - Tests : `test_chiffre_conventionnel_sans_texte_legifrance_rejete`, `…_couvert_par_le_texte`, `…_de_synthese_admis_si_divergence_declaree`, `test_phrase_sans_convention_non_concernee`, `test_numero_d_article_n_est_pas_un_chiffre_conventionnel`, `test_formule_de_reserve_ne_declenche_pas_la_regle_conventionnelle` (5 formules), `test_formule_de_reserve_n_excuse_pas_un_vrai_chiffre_conventionnel`.
- **`convention_divergences(faits)`** (v.py:279) — bloquant AVANT génération (main.py:103) : pour chaque [sujet], si au moins un fait texte de convention existe, toute synthèse officielle (non texte de convention) du même sujet dont les quantités ne sont **pas toutes incluses** dans celles des textes → motif « Divergence sur « sujet » … L'article doit rapporter les deux sources ; à trancher avant publication ». Une synthèse sans quantité ne crée pas de divergence. Tests : `test_divergence_texte_et_synthese_detectee`, `test_pas_de_divergence_si_memes_chiffres_ou_sujets_differents`, `test_process_article_divergence_conventionnelle_a_verifier_sans_generation` (test_modules).

### 2.6 Exemples de calcul / hypothèses (`hypothesis_amounts`, v.py:330-394)
- Un passage commence par une phrase qui débute par `Hypothèse :`, `Exemple :`, `Exemple de calcul :` ou `Cas pratique :` (insensible à la casse, `_HYPOTHESIS_START_RE`) et **s'arrête au prochain intertitre** (une phrase égale au texte d'un `<h1-6>` du fragment).
- Montants admis dans le passage : montants en € de la phrase d'ouverture (données de l'hypothèse, hors résultats de calcul de cette phrase) + résultats de calculs **justes** + somme (arrondie à 2 décimales) des résultats des phrases précédentes (le « soit 768 € »).
- Calcul : `_CALC_RE` = expression `N (op N)+ = N €|euro(s)`, opérateurs `× x * + − -`. `_eval_calc` : priorité × sur +/− (gauche à droite). Juste si |attendu − annoncé| ≤ 0,005, sinon ERREUR « Calcul faux dans un exemple : … (attendu X.XX) ».
- Tests : `test_exemple_de_calcul_explicite_et_juste_accepte`, `test_exemple_de_calcul_faux_rejete`, `test_montant_hors_passage_d_hypothese_toujours_rejete`, `test_passage_d_hypothese_s_arrete_au_prochain_intertitre`, `test_montant_non_calcule_dans_l_exemple_rejete`.

### 2.7 Signalement dans le prompt des faits à référence non citable (`format_faits_for_prompt`, v.py:155)
Pas un contrôle, mais une règle produite par le code : un fait **non légal** (URL hors `LEGAL_SOURCE_DOMAINS`) dont le texte contient un motif de `_LEGAL_PATTERNS` reçoit « ⚠ Source non officielle : n'en cite PAS la référence légale … ». Format d'une ligne : `[n] fait — Source : source (annee, url)`. `format_faits_for_prompt_subset` garde la numérotation d'origine. Tests : `test_prompt_signale_reference_legale_non_citable`, `test_format_faits_subset_garde_la_numerotation`, `test_ligne_sans_url_jamais_source_legale`.

### 2.8 Usage des faits (`fact_usage`, v.py:1285) — sert à la relance, pas bloquant
Un fait est « utilisé » si : détecté par `check_facts` ; déclaré par le modèle ; libellé de la source (avant la 1re virgule, normalisé, ≥ 4 caractères) trouvé avec bornes `(?<![\w-])…(?![\w-])` dans le texte normalisé de l'article ; ou URL (normalisée) présente dans `sources` ou en sous-chaîne des `href`. Les faits non utilisés sont proposés au modèle lors de la relance. Tests : `test_fact_usage_raisons`, `test_retry_suggere_les_faits_non_utilises`, `test_retry_sans_suggestion_quand_tous_les_faits_sont_utilises` (test_modules).

### 2.9 Recherche automatique : quand un fait est retenu ou écarté (`research.verify_facts`, research.py:152-185)
Contrôles faits **par le code**, dans cet ordre (le premier échec donne la raison) :
1. Nettoyage : `fait` et `source` : blancs repliés, `|` → `/` ; `annee` gardée seulement si `(19|20)\d\d`, sinon vide.
2. `fait`, `source` vides ou URL ne commençant pas par `http` → « champ manquant ».
3. URL de page d'accueil → « page d'accueil ».
4. `is_competitor_url(url)` → « site d'un concurrent : hôte » (**vérifié avant les domaines** : un concurrent reste refusé même ajouté par `domaines_recherche`).
5. Hôte hors `RESEARCH_DOMAINS` ∪ `domaines_recherche` de la ligne (égalité ou sous-domaine) → « domaine non autorisé ».
6. URL (normalisée) non lue par `web_fetch` pendant la recherche → « URL non lue pendant la recherche ».
7. Page lue sans texte (PDF en base64) → « page sans texte vérifiable (PDF) ».
8. `_flat(extrait)` de moins de **40 caractères** ou absent de `_flat(texte de la page)` → « extrait introuvable mot pour mot dans la page ».
9. Nombres du fait (`extract_numbers`) non tous présents dans l'extrait → « nombre(s) absent(s) de l'extrait : … ».
Sinon retenu `{fait, source, url, annee}` (l'extrait n'est pas gardé). Troncature à `MAX_FAITS` = 15. Si moins de `MIN_FAITS` = 4 → « À vérifier » (main.py:96).
- `_flat` (research.py:132) : liens/images Markdown `[x](…)` → `x` ; marqueurs de début de ligne (`-*+`, `1.`/`1)`, `#`, `>`) → espace ; `**`, `__`, `` ` ``, `|` → espace ; `strip_tags` ; `norm` ; tirets U+2010-U+2015 → `-` ; `« » “ ”` → `"` ; blancs repliés ; espace avant `.,;:!?)` supprimé.
- `fetched_pages` (research.py:113) : seuls les blocs `web_fetch_tool_result` dont le contenu est `web_fetch_result` ; texte = `content.source.data` si `source.type == "text"`, sinon chaîne vide.
- Outils : `web_search_20250305` (max 8 utilisations, `allowed_domains`, localisation FR) et `web_fetch_20250910` (max 12, `max_content_tokens` 30 000, `allowed_domains`). Boucle `pause_turn` : 4 pauses au plus ; `refusal` / `max_tokens` (32 000) → RuntimeError. Réponse finale illisible → `[("", "réponse finale illisible")]`.
- Cellule écrite : `fait | source | url | annee` (sans ` |` final), relisible par `parse_faits_sources`.
- Trace : `output/recherche/<slug>.json` (pages lues, candidats, retenus, écartés).
- Tests (test_research.py) : `test_fait_fidele_retenu`, `test_faits_ecartes` (mot pour mot, non lue, domaine, accueil, nombre), `test_pdf_sans_texte_ecarte`, `test_cellule_relue_par_le_sheet`, `test_recherche_bout_en_bout_avec_pause`, `test_page_en_markdown`, `test_domaine_ajoute_pour_la_ligne`, `test_site_concurrent_refuse_meme_si_domaine_ajoute`. Pas de test pour : « champ manquant », extrait < 40 caractères, troncature à 15, `annee` invalide vidée, `|` remplacé. Main : `test_main_sans_faits_lance_la_recherche_puis_a_verifier_si_insuffisante`, `test_main_sans_faits_ecrit_les_faits_trouves_et_redige`.

---

## 3. Structure de l'article (GEO : TL;DR, capsules, FAQ, H2)

### 3.1 `check_tldr` (v.py:833-845) — ERREUR
- L'introduction doit contenir **exactement** `<div class="tldr-box">` (guillemets doubles, aucun autre attribut ; recherche sensible à la casse). Contenu = jusqu'au **premier** `</div>` (non gourmand).
- Nombre de `<li` dans ce contenu : **3 à 5**.
- Aucun attribut `style=` dans l'introduction.
- `sanitize_html` (v.py:696) retire tous les `style="…"`/`style='…'` et transforme `class='tldr-box'` en `class="tldr-box"` avant validation (à la génération).
- Tests : `test_tldr_style_supprime_par_sanitize`, `test_tldr_absente`. Pas de test pour 2 ou 6 points.

### 3.2 Capsules (v.py:723-799) — ERREUR
- **Position de capsule** : dans un bloc de contenu, le `<strong>` qui ouvre le `<p>` suivant **immédiatement** un `</h2>` (`(</h2>\s*<p>\s*)<strong\b[^>]*>(.*?)</strong>`) ; dans la FAQ, le `<strong>` qui ouvre la réponse (`^\s*<p>\s*<strong…`). `<p>` doit être nu (sans attribut). Les autres `<strong>` (étiquette de puce, tableau) ne sont pas des capsules et sont retirés à la génération (`unwrap_article_strong`).
- `capsule_problems(inner)` (v.py:771) :
  - nombre de mots (`word_count`) entre **40 et 60** inclus ;
  - aucun lien `<a` ;
  - pas de reprise pronominale : premier mot (texte normalisé, coupé au premier espace) parmi `il elle ils elles cela ceci celui-ci celle-ci`, ou début `ce dernier`/`cette derniere`, ou n'importe où `ce dernier|cette derniere|ces derniers|ces dernieres|celui-ci|celle-ci|ceux-ci|celles-ci`.
- `check_capsules` (v.py:785) : problèmes de chaque capsule ; dans chaque bloc, nombre de `</h2>\s*<p>\s*<strong` < nombre de H2 → « Chaque H2 doit être suivi immédiatement d'une capsule <p><strong> » (une erreur par bloc) ; chaque réponse de FAQ sans capsule en tête → « Réponse sans capsule <strong> ».
- Avant validation, `fix_capsules` (generator.py:358) réécrit par LLM toute capsule fautive (2 essais).
- Tests : `test_capsule_bornes` (39/40/60/61), `test_capsule_avec_lien_rejetee`, `test_capsule_pronominale_rejetee` (Il/Elle/Ce dernier/Cela), `test_capsules_article_valide`, `test_h2_sans_capsule_rejete`, `test_faq_sans_capsule_rejetee`, `test_etiquette_en_gras_dans_une_puce_n_est_pas_une_capsule`, `test_unwrap_retire_le_gras_hors_capsule_et_garde_le_texte`, `test_faq_sans_capsule_en_tete_est_refusee`, `test_capsule_hors_plage_reecrite` (test_modules).

### 3.3 `check_titles` (v.py:802-830) — ERREUR
- H1 (`title`) vide → erreur.
- H1 interdit (une seule erreur) : `guide (complet|ultime|pratique|définitif)` n'importe où, ou `^guide` suivi de texte sans `:`/`?` puis `:` (insensible à la casse).
- `clean_h1` (v.py:808), appliqué au H1 imposé par le Sheet : retire `^guide( mot)?( 20xx)? :` et met la 1re lettre en majuscule. Un H1 imposé « Pointage BTP : le guide complet » reste refusé.
- H2 (pris dans `contenu[].texte` seulement, ni intro, ni conclusion, ni FAQ) : au moins un, et part des H2 finissant par `?` ≥ **60 %** (`H2_QUESTION_MIN_RATIO`).
- Tests : `test_titres_valides`, `test_h1_guide_complet_rejete` (3 formes), `test_clean_h1`, `test_ratio_h2_questions`, `test_ratio_h2_exactement_60`. Pas de test pour « H1 vide » ni « aucun H2 ».

### 3.4 `check_headings` (v.py:996-1010) — ERREUR
- `<h1` interdit dans tous les champs sauf le H1 (médias exclus).
- Contenu concaténé (`contenu[].texte`) : le premier intertitre H2-H6 doit être un H2 ; pas de saut de niveau vers le bas (H2 → H4) ; seul le premier saut est signalé. Remonter (H4 → H2) est permis. Intro, conclusion et FAQ ne sont pas examinées pour les niveaux.
- Test : `test_h1_et_saut_de_niveau_refuses`. Pas de test pour « premier intertitre ≠ H2 ».

### 3.5 `check_fanout` — sous-requêtes (v.py:1182-1193) — ERREUR
- `sous_requetes` : **5 à 8** éléments.
- Chaque élément doit avoir un `h2` dont la forme normalisée est **égale** à celle d'un H2 existant ; sinon « Sous-requête « requete » non couverte par un H2 existant ».
- Tests : `test_fanout_valide`, `test_fanout_trop_court_et_h2_inconnu`.

### 3.6 FAQ
- À la création : seule la capsule en tête de chaque réponse est contrôlée (3.2). **Le nombre de questions n'est pas contrôlé par le code** (seulement demandé dans le prompt).
- Au refresh (`generator.check_refresh`, generator.py:718) : **4 à 6 questions** (ERREUR) ; capsule cherchée par `_STRONG_RE` **n'importe où** dans la réponse (moins strict que `check_capsules`) puis `capsule_problems`. Tests : `test_regenerate_refresh_parts_valide`, `test_generate_tldr_echec` (refresh_queue).

### 3.7 `check_media_proposals` (v.py:1196-1215) — AVERT. uniquement
- `images` : 2 à 3 propositions ; chacune avec `description_visuelle` et `alt` ; `position_apres_h2` égal (normalisé) à un H2.
- `video` : `titre` et `script` présents ; script de **130 à 250 mots** (≈ 60-90 s).
- Les images et la vidéo ne vont jamais dans le payload WordPress (test `test_build_payload_brouillon_auteur_et_acf`). En revanche leurs textes passent par `check_facts`, `check_offline`, `check_rating`, `check_brand`, `check_ai_traces`.
- Test : `test_medias_avertissements_non_bloquants`.

---

## 4. Longueur et lisibilité

### 4.1 `check_length` (v.py:1042-1051) — seulement à la génération
- `article_word_count` (v.py:989) = mots de introduction (**TL;DR comprise**) + conclusion + blocs + (titre + texte) de chaque FAQ. Le H1 et les médias ne comptent pas.
- < **300** mots (`ARTICLE_MIN_WORDS`) → ERREUR. Pas de plafond.
- Cible `wordcount` du Sheet : écart > **30 %** (`WORDCOUNT_TOLERANCE`) → AVERT.
- Test : `test_longueur_et_traces_ia` (avertissement seulement). Pas de test pour l'erreur < 300.

### 4.2 Temps de lecture (generator.py:387) — pas un contrôle
`max(1, round(mots / 230))` + « min ». Même périmètre que `article_word_count`. Attention : `round` de Python arrondit au pair (2,5 → 2), alors que `Math.round` en JS arrondit 2,5 à 3.

### 4.3 Lisibilité
Aucun score de lisibilité (Flesch ou autre), aucune limite de longueur de phrase ou de paragraphe dans le code. La seule contrainte de longueur en dehors de l'article entier porte sur les capsules (40-60 mots), le script vidéo (130-250, avertissement) et les métas (60/155 caractères, avertissement).

---

## 5. Liens

### 5.1 `check_links` (v.py:925-955) — ERREUR + AVERT.
Champs : introduction, conclusion, blocs, réponses de FAQ. `href` extraits par `<a\b[^>]*href\s*=\s*["']([^"']+)["']`.
- `href` commençant par `/` → préfixé `https://tim-management.co`.
- Hôte sur `tim-management.co` (ou sous-domaine) ET chemin commençant par `/wp-content/uploads/` → fichier de la médiathèque : ignoré (ni interne ni sortant).
- Hôte se terminant par `tim-management.co` (**simple `endswith`, sans point**) → lien interne, compté ; si un sitemap est fourni et non vide, l'URL normalisée doit y figurer, sinon « Lien interne absent du sitemap ». `cms.tim-management.co/?p=123` est donc refusé.
- Autre `href` commençant par `http` :
  - page d'accueil → « Lien sortant vers une page d'accueil (URL précise attendue) » ;
  - URL normalisée présente dans les URL de `faits_sources` → acceptée ;
  - sinon l'hôte doit être dans `ALLOWED_OUTBOUND_DOMAINS` (égalité ou sous-domaine) : `legifrance.gouv.fr`, `insee.fr`, `service-public.fr`, `service-public.gouv.fr`, `urssaf.fr`, `ffbatiment.fr`, `code.travail.gouv.fr`. Sinon « Lien sortant hors domaines autorisés ».
- `href` relatifs sans `/`, `#ancre`, `mailto:`, `tel:` : ignorés.
- Plus de **5** liens internes → AVERT. « N liens internes (max recommandé : 5) ».
- Tests : `test_liens_sortants_et_internes`, `test_check_links_accepte_service_public_gouv_fr`, `test_check_links_accepte_fichiers_mediatheque`, `test_check_links_refuse_page_du_cms`, `test_code_travail_numerique_lien_et_reference_legale_acceptes`. Pas de test pour l'avertissement > 5.

### 5.2 `check_internal_linking` (v.py:1063-1094) — seulement à la génération, ERREUR
- `internal_links` : tous les champs sauf médias (H1 et yoast compris), liens dont l'hôte se termine par `tim-management.co`, hors médiathèque. Les doublons comptent.
- Au moins **3** liens internes (`INTERNAL_LINKS_MIN`).
- Au moins un lien vers une **page produit ou outil** : chemin ≠ `/` et ne commençant par aucun de `/actualite /contact /fiche-metier /centre-aide /video /faq /plan-du-site /auteur /author /comparatif` (préfixe de chaîne : `/videos` ou `/faq-x` sont exclus aussi).
- Ancres non descriptives (texte normalisé, sans ` .:` aux bords) : `ici`, `cliquez ici`, `cliquez`, `en savoir plus`, `lire la suite`, `cet article`, `ce lien`, `lien`, `voir`, `voir plus`, `plus d'infos`, `plus d'informations`.
- Liens obligatoires (`required_urls`) : tous présents (comparaison normalisée). Ils viennent de `resolve_site_urls(page_pilier + maillage_sortant)` (v.py:1097) : chemins `/…` ou URL `https://(www.)tim-management.co/…` cités dans les cellules, **gardés seulement s'ils sont dans le sitemap** (comparaison sur le chemin en minuscules sans `/` final) ; le texte libre est ignoré.
- Tests : `test_maillage_minimum_produit_ancres_et_liens_imposes`, `test_resolution_pilier_maillage_et_articles_voisins`.

### 5.3 Liens vers les concurrents (`check_competitor_links`, v.py:884-904) — ERREUR
- `is_competitor_url` : un **label** de l'hôte (TLD exclu) **commence par** la clé d'un concurrent. Clé = nom de `COMPETITOR_NAMES` normalisé, réduit à `[a-z0-9]`, gardé si ≥ 4 caractères (« Microsoft Project » → `microsoftproject`, « Eurécia » → `eurecia`). Ex. `combohr.com` → `combo` ✔, `www.skello.io` ✔.
- Dans le texte (`href` de tous les champs hors médias) : « Lien vers le site d'un concurrent interdit ». Nommer un concurrent reste permis.
- `include_sources=True` (dans `_finalize` seulement) : toute entrée de `sources` sur un site concurrent → « [sources] Source sur le site d'un concurrent interdite ».
- Utilisé aussi par la recherche (2.9, étape 4).
- Tests : `test_concurrent_nomme_permis_lien_interdit` (Kalitics et Sage permis), `test_site_concurrent_refuse_meme_si_domaine_ajoute`.

### 5.4 Liens sortants et sources : trois listes de domaines différentes
| Liste | Rôle |
|---|---|
| `ALLOWED_OUTBOUND_DOMAINS` (v.py:20) | liens sortants dans le corps (+ toute URL de faits_sources) |
| `LEGAL_SOURCE_DOMAINS` (v.py:40) = legifrance.gouv.fr, service-public.fr, service-public.gouv.fr, code.travail.gouv.fr | fait autorisant une référence légale |
| `CONVENTION_TEXT_DOMAINS` (v.py:48) = legifrance.gouv.fr (+ `/conv_coll/` ou KALI) | texte de convention |
| `OFFICIAL_SYNTHESIS_DOMAINS` (v.py:51) = code.travail.gouv.fr, service-public.fr, service-public.gouv.fr, travail-emploi.gouv.fr | synthèse officielle |
| `RESEARCH_DOMAINS` (config.py:54) | domaines de recherche et de lecture |

---

## 6. SEO technique

### 6.1 `check_seo_meta` (v.py:1022-1039) — seulement à la génération
- `yoast_title` (après strip_tags et trim) vide → ERREUR ; > **60** caractères → AVERT. (troncature).
- Mot-clé absent du `yoast_title` (`keyword_present`) → ERREUR.
- `yoast_description` vide → ERREUR ; > **155** caractères → AVERT.
- Test : `test_meta_yoast_et_mot_cle_en_ouverture`.

### 6.2 `check_keyword_intro` (v.py:1013-1019) — seulement à la génération, ERREUR
Introduction sans le bloc `<div class="tldr-box">…</div>` → 50 premiers mots (`KEYWORD_INTRO_WORDS`) → `keyword_present`. Test : `test_meta_yoast_et_mot_cle_en_ouverture`.

### 6.3 `keyword_present` / `topic_tokens` (v.py:981, 1136)
- `topic_tokens(text, generic)` : `norm`, jetons `[a-z0-9]+`, retire un `s`/`x` final si le mot a ≥ 4 caractères, écarte les mots de < 3 caractères, les mots vides (2e liste `_STOPWORDS`, v.py:1125) et les années `20\d\d` ; si `generic=False`, écarte aussi `_SITE_GENERIC` = btp, batiment, chantier, guide, regle, mode, pointage, feuille, heure, logiciel, ouvrier, meilleur, top.
- `keyword_present` : (mots du mot-clé ∩ mots du texte) × 3 ≥ 2 × (nombre de mots du mot-clé) — au moins 2/3, mots génériques **compris**. Mot-clé sans mot porteur → toujours vrai.

### 6.4 Slug, catégorie, auteur, statut (wordpress.py, main.py, sheets.py) — pas de rejet, des normalisations
- Slug : `slug_from_sheet` = dernier segment du chemin de la colonne H, en minuscules ; vide → aucun slug envoyé (WordPress le fabrique). **Aucun contrôle de format ou de longueur du slug.** Test : `test_build_payload_slug_et_categorie`.
- Catégorie : `CATEGORY_IDS_BY_NAME[norm(colonne F)]` ; inconnue → aucune catégorie envoyée (main.py:180).
- Auteur : `parse_author` (sheets.py:87) : entier > 0, ou nom connu (`AUTHOR_IDS_BY_NAME`, comparaison `norm`), sinon `AUTHOR_ID_DEFAULT` = 1 ; une valeur non vide non reconnue est signalée (`auteur_invalide`). Test : `test_parse_author`.
- Statut : toujours `draft` (`assert`).
- `focuskw` Yoast = mot-clé. `methode.assistance_ia = true`, `note_methode` fixe.
- Champs ACF manquants dans la réponse WP → message seulement (`missing_acf_fields`, test `test_missing_acf_fields`).

### 6.5 Schema.org
**Aucun contrôle dans le code** : le balisage est produit par Yoast côté serveur (`yoast_head_json`, wordpress.py:62-64, 127). Le pipeline n'émet ni ne valide de JSON-LD.

### 6.6 Cannibalisation (`cannibalization_conflicts`, v.py:1157-1179) — bloquant avant génération
- Mots porteurs du mot-clé (`topic_tokens`, `generic=False`) ; moins de 2 → pas de contrôle.
- Comparé à : chaque URL du sitemap contenant `/actualite/` mais pas `/actualite/categorie/` (dernier segment du chemin) ; et le mot-clé de **toutes les autres lignes de type « article » du Sheet**, quel que soit leur statut.
- Conflit (`_overlaps`) : au moins 2 mots communs ET au moins 2/3 du plus court des deux ensembles.
- Ignoré si la colonne `cannibalisation_validee` est non vide.
- Tests : `test_cannibalisation_article_publie`, `test_cannibalisation_mots_generiques_et_categories_ignores`, `test_cannibalisation_autre_ligne_du_sheet`.
- `related_articles` (v.py:1109) : articles du sitemap partageant au moins un mot porteur, 12 au plus, triés par nombre de mots communs : contexte du prompt, pas un contrôle. Test : `test_resolution_pilier_maillage_et_articles_voisins`.

---

## 7. GEO (récapitulatif des contrôles qui servent la reprise par les moteurs IA)
- TL;DR 3-5 points, en tête d'introduction, sans style (3.1).
- Capsules de 40-60 mots, autonomes, sans lien, sans pronom de reprise, après chaque H2 et en tête de chaque réponse de FAQ (3.2).
- ≥ 60 % des H2 en question (3.3).
- 5 à 8 sous-requêtes (fan-out), chacune couverte par un H2 existant (3.5).
- Sources précises dès qu'un chiffre est cité (2.3), champ `sources` construit seulement à partir de faits_sources (2.2), `methode.assistance_ia` (6.4).
- Relecture de fidélité (LLM) : hors périmètre « code », mais bloquante (0.2).

---

## 8. Ton, marque et vocabulaire interdit

### 8.1 `check_brand` (v.py:856-866) — ERREUR
`\bTIM\s+[Mm]anagement\b` (sensible à la casse) sur le texte sans balises, tous les champs (médias compris) : « TIM Management » et « TIM management » refusés ; « Tim Management » correct. « TIM » seul et « tim management » en minuscules ne sont pas refusés. Tests : `test_check_brand_refuse_ancienne_forme`, `test_check_brand_accepte_tim_management`, `test_validate_article_inclut_check_brand`.

### 8.2 `check_rating` — note ou avis (v.py:869-881) — ERREUR
Par phrase normalisée, tous les champs : `\d([,.]\d)?\s*/\s*5\b` (« 4,9/5 ») | `note(e)? <chiffre>` | `moyenne des avis` | `<nombre> avis` | `etoiles` (pluriel seulement). Test : `test_note_des_avis_refusee` (3 refus, 1 phrase acceptée « 3 étapes, sur 5 chantiers »).

### 8.3 `check_offline` — fonctionnement hors connexion (v.py:848-918) — ERREUR
Par phrase normalisée, tous les champs (FAQ comprise) :
- `_OFFLINE_RE` : `hors ligne`, `hors-ligne`, `hors connexion`, `hors-connexion`, `offline`, `off-line`, `off line`, `mode deconnecte` ;
- ou `sans (aucun )?reseau` **et** dans la même phrase un mot de fonction (`_FEATURE_RE`) : `fonctionn…`, `pointer/pointez/pointe`, `pointage`, `saisi…`, `synchronis…`, `applica…`, `appli`, `mode`, `logiciel`, `outil`, `enregistr…`, `stock…`.
Tests : `test_hors_connexion_refuse` (6 phrases), `test_hors_connexion_refuse_partout`, `test_hors_connexion_refuse_en_faq`, `test_zone_sans_reseau_sans_promesse_acceptee`, `test_article_standard_sans_hors_connexion`.

### 8.4 `check_ai_traces` (v.py:974-1060) — ERREUR
Par champ (texte normalisé sans balises), tous champs : `en tant que modele|ia|intelligence artificielle|assistant` (aussi `en tant qu'…`), `je n'ai pas acces`, `je n'ai pas acces aux donnees en temps reel`, `as an ai`, `language model`, `date de connaissance`, `knowledge cutoff`, `je ne peux pas naviguer|acceder`. « données en temps réel » seul est permis. Tests : `test_longueur_et_traces_ia`, `test_temps_reel_legitime_pas_une_trace_ia`.

### 8.5 Règles de ton qui ne sont PAS vérifiées par le code (prompt seulement, generator.py)
Pour mémoire, afin de ne pas croire qu'elles sont garanties : pas de prix ni tarif de Tim, essai « Premier mois offert, sans engagement » seul fait de référence, pas de promesse de conformité ou de résultat (« garantit », « en 2 clics », « -50 % »), CTA uniquement vers `/contact` (jamais `demande-demo-suivi-temps`), TL;DR sans promotion, pas d'extrapolation, intention TOFU/MOFU/BOFU, mots-clés secondaires. Seule une partie est rattrapée indirectement (un « -50 % » ou un prix seront refusés comme chiffres non sourcés).

---

## 9. Autres

### 9.1 Reprise d'articles publiés (refresh.py, generator.py) — ERREUR
- `check_tldr_no_new_facts` (generator.py:602) : `check_tldr` sur la TL;DR seule + `check_facts([TL;DR], faits, "")` (sans cas client) + tout nombre de la TL;DR doit déjà figurer dans le texte de l'article (`article_plain_text`). Tests : `test_tldr_refuse_chiffre_du_contenu_non_source`, `test_tldr_refuse_nombre_absent_du_contenu`, `test_generate_tldr_retry_puis_ok`, `test_generate_tldr_echec`.
- `regenerate_refresh_parts` : nombre de capsules reçues = nombre de capsules existantes (sinon erreur) ; `check_facts(refresh_texts)` + `check_refresh`. Test : `test_regenerate_refresh_parts_mauvais_nombre_de_capsules`.
- `body_violations` (refresh.py:79) : `check_facts` sur le reste de l'article (hors TL;DR, capsules, FAQ, médias). Test : `test_body_violations_hors_parties_regenerees`.
- `_apply_sources` refuse si le nombre de sections a changé, si aucune différence réelle (`has_real_change` sur texte normalisé), ou si `check_sources` échoue. `needs_refresh` : empreinte SHA-256 (16 car.) de faits + cas client changée, ou parties actuelles non conformes. Tests : `test_needs_refresh`, `test_extract_apply_refresh_aller_retour`, test_refresh_queue.

### 9.2 Sélection des lignes du Sheet (sheets.py)
Statut « Planifié » (insensible à la casse), type « article », date de publication vide, aujourd'hui ou passée (formats `%Y-%m-%d`, `%d/%m/%Y`, `%d-%m-%Y` ; format inconnu = accepté). Mot-clé = « Mot-clé principal », sinon cluster (E). Colonnes optionnelles repérées par en-tête normalisé, uniquement à partir de la colonne I. `domaines_recherche` : regex `[A-Za-z0-9.-]+\.[A-Za-z]{2,}`, minuscules, sans point aux bords (une URL donne son hôte). Tests : `test_parse_row_*`, `test_build_column_map_*`, `test_keyword_repli_sur_cluster_si_mot_cle_vide`, `test_colonne_domaines_recherche`.

### 9.3 Chiffres des pages concurrentes (scraper.py:121-131)
Seule dépendance à BeautifulSoup + lxml. Les phrases chiffrées des concurrents (avec `%`, ou attribution + nombre, ou organisme + nombre, ≤ 400 caractères, 15 au plus) partent dans l'e-mail, **jamais dans le prompt** (seuls H2, H3 et questions y vont). Tests : `test_extract_competitor_questions_et_chiffres`, `test_chiffres_concurrents_jamais_dans_le_prompt`.

---

## 10. Constantes de config et de validation qui sont des règles

### config.py
- `RESEARCH_DOMAINS` (l.54) : legifrance.gouv.fr, service-public.fr, service-public.gouv.fr, code.travail.gouv.fr, travail-emploi.gouv.fr, urssaf.fr, boss.gouv.fr, net-entreprises.fr, impots.gouv.fr, economie.gouv.fr, ameli.fr, insee.fr, cnil.fr, inrs.fr, preventionbtp.fr, cibtp.fr, ffbatiment.fr, fntp.fr, capeb.fr, francetravail.fr, francenum.gouv.fr (sous-domaines compris), + `domaines_recherche` de la ligne.
- `COMPETITOR_NAMES` (l.67) : Kelio, Bodet, Bizneo, Agendrix, Factorial, Eurécia, Eurecia, Skello, Combo, Snapshift, Traxxeo, Novade, Organilog, Keobat, Alobees, iXbat, CGSI, Batiscript, Hellio, Batappli, Codial, Everwin, Batigest, ProGBTP, Fieldwire, Vertuoza, Procore, Archipad, Finalcad, Obat, Graneet, Kizeo, Planday, Microsoft Project. **Non concurrents** (commentaire) : Kalitics (partenaire, retiré le 03/11), Sage, Cegid, Onaya, Silae.
- `CATEGORY_IDS_BY_NAME` (l.28) : pointage 58, planning 59, feuilles d'heures 60, suivi de chantier 61, paie & rh 62, fiches metier 63, comparatifs 64 (clés normalisées).
- `AUTHOR_ID_DEFAULT` = 1 ; `AUTHOR_IDS_BY_NAME` : charlie piancatelli → 1, aude pretrelini → 4.
- `CLAUDE_MODEL` par défaut `claude-opus-4-8` (variable d'environnement).

### validation.py
`SITE_DOMAIN` = tim-management.co ; `MEDIA_UPLOADS_PATH` = /wp-content/uploads/ ; `ALLOWED_OUTBOUND_DOMAINS` ; `ORGANISMES` ; `LEGAL_SOURCE_DOMAINS` ; `CONVENTION_TEXT_DOMAINS` + `CONVENTION_TEXT_PATH` + `KALI_ID_RE` ; `OFFICIAL_SYNTHESIS_DOMAINS` ; `BRAND_ALLOWLIST` = (tim management) ; `CAPSULE_MIN/MAX_WORDS` 40/60 ; `H2_QUESTION_MIN_RATIO` 0,6 ; `FANOUT_MIN/MAX` 5/8 ; `VIDEO_MIN/MAX_WORDS` 130/250 ; `CALC_CONSTANTS` (12, 52, 35, 151,67, 100) ; tolérance € ± 0,50 (direct/dérivé) et ± 0,005 (calcul d'exemple) ; `SEO_TITLE_MAX` 60 ; `SEO_DESC_MAX` 155 ; `ARTICLE_MIN_WORDS` 300 ; `WORDCOUNT_TOLERANCE` 0,3 ; `INTERNAL_LINKS_MIN` 3 ; seuil d'avertissement de 5 liens internes (écrit en dur, v.py:953) ; `KEYWORD_INTRO_WORDS` 50 ; `_WEAK_ANCHORS` ; `_NON_PRODUCT_PREFIXES` ; `_SITE_GENERIC`.

### research.py / generator.py
`MIN_FAITS` 4, `MAX_FAITS` 15, `MAX_SEARCHES` 8, `MAX_FETCHES` 12, `MAX_FETCH_TOKENS` 30 000, `MAX_PAUSES` 4, `MAX_TOKENS_RESEARCH` 32 000 ; extrait ≥ 40 caractères (en dur) ; `CAPSULE_REWRITE_ATTEMPTS` 2 ; 1 relance d'article ; 40 erreurs au plus dans le message de relance ; FAQ 4-6 (refresh) ; 230 mots/min.

---

## 11. Couverture des tests (synthèse)
Couvert : à peu près toutes les règles de `check_facts`, conventions, hypothèses, capsules, titres, TL;DR (présence et style), liens (sortants, sitemap, médiathèque, concurrents), hors connexion, note/avis, marque, cannibalisation, méta Yoast, mot-clé en ouverture, maillage, traces IA, recherche (8 tests).
**Pas de test** : TL;DR avec 2 ou 6 points ; H1 vide ; aucun H2 ; premier intertitre ≠ H2 ; avertissement > 5 liens internes ; erreur longueur < 300 mots ; titre/description vides séparément (testés ensemble) ; `check_media_proposals` détail (position_apres_h2, alt manquant) ; recherche : « champ manquant », extrait < 40 caractères, plafond de 15, année invalide ; `hypothesis_amounts` avec « Cas pratique : » ; motifs `loi n°`, `décret n°`, `arrêté du` ; entités motifs 2 et 3 hors « Maçonnerie » ; `_TESTIMONIAL_RE` hors « témoigne » ; ancres faibles autres que « ici ».

---

## 12. Points fragiles ou implicites (à traiter au portage)

1. **`_STOPWORDS` défini deux fois** (v.py:518 et v.py:1125). En Python, la seconde définition écrase la première au chargement du module : `_content_words` (contexte des chiffres) utilise donc **la liste de la cannibalisation**, pas celle prévue pour lui. La première liste (les, mais, selon, taux, mois de l'année, annee, plus, tout, cette…) est du code mort. Conséquence vérifiée : `selon`, `taux`, `janvier`, `annee`, `plus`, `cette`, `fait`, `peut`… **comptent comme mots de contexte**. Un « 13 % » peut ainsi être couvert par un fait qui ne partage que « taux » ou « selon ». Les tests passent avec ce comportement : il faut choisir entre le reproduire (fidélité) ou le corriger (et relancer les tests R97 et euros, qui peuvent changer).
2. **`\b` et `\w` Unicode vs ASCII.** Python 3 : `\w`, `\b`, `\d` sont Unicode. JavaScript (même avec `u`) : `\w`/`\b` ASCII seulement. Touché en texte brut (non normalisé) : `_CAP = [A-ZÀ-Ý][\w'’-]+` (« Maçonnerie », « Rénovation », « Société » coupés au premier accent), `\b[ée]tapes?`, `\bd[ée]cret`, `\barr[êe]t[ée]`, `ann[ée]es\b`, `salari[ée]s\b`, `_ATTRIBUTION_RE` (`\bbarom[èe]tres?\b`), `_RESERVE_RE`, `_HYPOTHESIS_START_RE`, et les bornes `(?<![\w-])…(?![\w-])`. En TS, remplacer par des classes explicites (`[\p{L}\p{N}_]` avec le drapeau `u`) et des bornes en lookaround (`(?<![\p{L}\p{N}_])`).
3. **Modificateurs de casse locaux `(?i:…)`** dans `_ATTRIBUTION_RE` et `_ENTITY_PATTERNS` (n° 4 et 6) : la majuscule qui suit « selon » / « chez » doit rester sensible à la casse alors que le déclencheur ne l'est pas. Ces modificateurs n'existent en JS que depuis ES2025 (Node ≥ 23 / V8 12.5). Sinon, réécrire les déclencheurs en classes `[Ss]elon`, `[Cc]hez`, etc.
4. **`norm` = NFKD + retrait des diacritiques + minuscules + unescape HTML.** En TS : `he.decode` (ou `entities`) pour les entités HTML5 complètes, puis `.normalize('NFKD').replace(/\p{M}/gu, '')`. `unicodedata.combining(c) != 0` et `\p{M}` ne sont pas strictement identiques (marques Mc/Me de classe 0), sans effet sur du français. `œ`/`æ` ne sont pas décomposés : « œuvre » → `œuvre`, et les jetons `[a-z]+` le coupent en `uvre`. À reproduire tel quel, ou corriger en connaissance de cause.
5. **Ordre strip_tags puis unescape** (balise → espace, puis entités) : à respecter, sinon `&lt;…&gt;` serait retiré. Le remplacement des balises par un espace modifie aussi le nombre de mots et le découpage (« <b>4</b>,9 » → « 4 ,9 »).
6. **`str.split()` sans argument** (word_count) découpe sur tous les blancs Unicode (NBSP et espace fine compris). En JS, `trim().split(/\s+/u)` donne le même résultat ; attention à la chaîne vide (`"".split(/\s+/)` vaut `[""]`, soit 1 mot au lieu de 0).
7. **Découpage en phrases** : lookbehind/lookahead (`(?<=[.!?…])\s+(?=[A-ZÀ-ÝÉÈ«"(])`) et logique de recollage (M., Mme., Dr., art., n°.). Le lookbehind est supporté en JS moderne. Les phrases servent de **clés** dans `hypothesis_amounts` (dict phrase → montants admis) : deux phrases identiques dans un même fragment partagent la même entrée.
8. **Tout est en regex sur du HTML, sans parseur** dans validation.py : `<div class="tldr-box">(.*?)</div>` s'arrête au premier `</div>` (une div imbriquée casse le compte de `<li>`) ; la classe doit être exactement `class="tldr-box"` ; les capsules exigent `<p>` sans attribut ; `href` entre guillemets seulement. Un port avec un vrai parseur DOM (cheerio, parse5) donnerait des résultats **différents** sur du HTML atypique. Pour être fidèle, garder des regex équivalentes. BeautifulSoup/lxml ne sert que dans `scraper.py` (pages concurrentes, sitemap) : cheerio suffit.
9. **Drapeaux regex** : `re.S` (le point couvre `\n`) → drapeau `s` en JS. `re.I` + Unicode : `É/é` bien repliés en JS avec `i` (mieux avec `u`). `\d` Python couvre tous les chiffres Unicode, JS seulement 0-9 (sans impact pratique).
10. **Sous-chaîne pour les références légales** : `l3171-4` est trouvé dans `l3171-45` (vérifié : « article L3171-4 » passe avec un fait Légifrance qui ne cite que L3171-45) ; `decret`, `arrete` et `conventioncollective` génériques sont satisfaits par n'importe quel fait légal qui contient le mot. Seul le 1er article d'une plage « D3141-12 à D3141-20 » est contrôlé. `_compact` supprime **tous** les points et espaces des deux côtés.
11. **Comparaison d'hôtes** : `check_links` et `internal_links` utilisent `host.endswith("tim-management.co")` **sans point** (`faux-tim-management.co` passerait pour interne) ; `_host_in` est correct (égalité ou `.domaine`). `is_competitor_url` compare des **préfixes de label** (`obat` attrape aussi `obatech.fr` ; `combo` attrape `combourg.fr`) ; le TLD est exclu, mais pas `www`. `urlparse().hostname` en minuscules et sans port : utiliser `new URL()` en TS (lève une exception sur une URL invalide, alors que Python renvoie `None` : prévoir try/catch).
12. **`_norm_url` met toute l'URL en minuscules**, chemin et query compris : deux URL qui ne diffèrent que par la casse du chemin sont considérées identiques (sitemap, faits, sources, pages lues par la recherche).
13. **Nombres** : `extract_numbers` renvoie des chaînes normalisées (pas des nombres) ; les montants sont convertis par `float()` pour les tolérances. « 3.0 » → « 3 », « 4,20 » → « 4.2 », mais « 10 » reste « 10 » (le retrait des zéros finaux ne s'applique qu'aux décimaux). Les séparateurs de milliers sont l'espace, la NBSP et l'espace fine, **pas le point** (« 1.607 » = 1,607). Les années comptent comme nombres dans `check_facts` dès qu'une phrase est attribuée (l'année doit alors être dans fait/source/annee).
14. **Arrondi** : `round()` Python arrondit au pair (temps de lecture, `round(sum(previous), 2)` dans les hypothèses) ; `Math.round` non. Les tolérances flottantes (0,5 et 0,005) sont à garder telles quelles.
15. **Python `in` sur chaîne** = sous-chaîne (entités autorisées si sous-chaîne du cas client : « Martin » est autorisé si le cas client contient « Martinez ») ; sur ensemble = appartenance. À ne pas confondre au portage.
16. **Ensembles et ordre** : plusieurs messages trient des ensembles (`sorted`) pour un ordre stable ; `dict.fromkeys` dédoublonne en gardant l'ordre. En TS, `Set` garde l'ordre d'insertion mais `sort()` par défaut compare en UTF-16 (identique pour des chiffres ASCII).
17. **Messages d'erreur = contrat** : les tests vérifient des sous-chaînes (« Référence légale », « Montant en euros absent », « Montant calculé », « suivi immédiatement », « attendu 5-8 », « non couverte », « minimum 3 », « page produit », « Ancre non descriptive », « obligatoire absent », « absent du sitemap », « page d'accueil », « [sources] », « Calcul faux », « Divergence », « Fidélité au fait [n] »…), et le modèle les reçoit mot pour mot lors de la relance. Les traduire ou les reformuler change le comportement du modèle.
18. **Périmètres de champs différents selon la règle** : `check_sources` ignore la FAQ ; `check_links` ignore H1/yoast/médias ; `check_facts` couvre les médias ; `check_headings` et les H2 ne regardent que `contenu` ; `article_word_count` inclut la TL;DR et la FAQ mais pas le H1. À reproduire champ par champ.
19. **Effets de bord avant validation** : `sanitize_article` et `unwrap_article_strong` modifient l'article ; `clean_h1` remplace le titre ; `fix_capsules` appelle le LLM. La validation porte sur l'article **après** ces transformations : le port doit garder cet ordre.
20. **Dépendance à l'état extérieur** : sitemap scrapé et mis en cache (vide = contrôle « absent du sitemap » désactivé, alors que `required_urls` reste vide) ; `date.today()` dans le prompt de recherche ; colonnes du Sheet repérées par en-tête normalisé à partir de la colonne I.
21. **Fidélité (LLM)** : bloquante mais non déterministe ; une réponse illisible laisse passer l'article. Elle n'est lancée que si tout le reste passe : au portage, garder cette condition (coût et ordre des erreurs).
22. **Bibliothèques Python à remplacer** : `re` (voir 2, 3, 9), `unicodedata` (`String.prototype.normalize`), `html.unescape` (`he`/`entities`), `urllib.parse.urlparse` (`URL`, attention aux URL relatives et invalides), `json` (sortie modèle avec fences), `hashlib.sha256` (empreinte de refresh, `json.dumps(sort_keys=True, ensure_ascii=False)` : la sérialisation JSON doit être **identique** pour que les empreintes déjà stockées restent valides), `bs4` + `lxml` (scraper seulement).
