# Règles du support — référentiel

Comment chaque chiffre, chaque état et chaque rappel du back-office est calculé.
Écrit pour l'équipe, et lu tel quel par l'assistant (`core/lib/ai-assistant.ts`)
quand on lui pose une question : ce qui n'est pas ici, il ne le sait pas.

## Les objets

- **Opportunité** (`partner-clients`) : une entreprise amenée par un partenaire, du prospect au client. Statuts, dans l'ordre du pipeline : Nouvelle → En qualification → Démo programmée → En attente d'engagement → En attente longue → **En phase de test** → **Gagnée** (client actif, facturé) ; fins : Perdue, Résilié, Archivé. « Gagnée » est la seule qui entre dans le CA.
- **Partenaire** (`partners`) : apporteur d'affaires. Deux genres : *métier* (amène des clients, touche une commission = CA HT × son taux) et *utilisateur* (programme de points). Le « partenaire du site vitrine » porte les leads venus des formulaires.
- **Parcours** (`journey-runs`) : la phase de test d'un client, 4 semaines par défaut, démarrée un lundi, avec ses étapes et ses e-mails programmés.
- **Tâche** (`client-activities` de type « tache ») : un rappel daté sur une opportunité (appel, relance…), coché quand c'est fait.
- **Ticket** (`tickets`) : demande d'un client au support ; états nouveau, pris en compte, en cours, en attente, résolu ; priorité dont « urgent ».
- **Développement** (`developments`) : ce qui se développe (feature, évolution, bug), avec une checklist et des discussions.
- **Connexion API** (`integrations`) : un logiciel tiers que le logiciel TIM connectera ; **Connexions du support** : les API que le back-office utilise lui-même (Pennylane, Brevo, INSEE, Google, Anthropic).

## Le parcours (phase de test)

23 étapes, chacune avec un acteur : **TIM** (admin), **Partenaire**, **Client**. Une étape est *faite*, *à faire*, *bloquée*, ou *en validation automatique* (un compte à rebours de 2 h après un fait constaté, annulable).

- Étapes **système** : cochées par le geste lui-même (créer le compte espace client, réserver un créneau, transmettre le dossier, générer les accès, signer). Pas de bouton.
- Étapes **cochées à l'envoi** : les deux conseils d'usage (J+1, J+7) se cochent quand l'e-mail part. Jamais « en retard », jamais rappelées.
- Étapes qui **s'acquièrent d'elles-mêmes** le lendemain : la session de prise en main (après son créneau), les accès distribués (après le provisionnement).
- **Go/No-Go** (validation admin) : jamais automatique, décision de TIM.
- Étapes **datées** — session, relevés d'usage J+2, J+7, mi-parcours, avant bilan, bilan : ne se cochent **pas avant leur jour** (jour civil de Paris). Un relevé est un constat du jour dit.
- Le bouton « valider » se pose sur la **première étape non acquise qui attend une main** (ni système, ni armée) ; les étapes suivantes attendent.
- Le statut du parcours est **dérivé** des étapes : en préparation, test en cours, gagné (mise en production cochée) ; perdu et annulé se posent à la main.
- **Rappels au partenaire** : le jour d'une étape partenaire échue, un e-mail « Une action vous attend » (une fois). Les étapes partenaire datées figurent aussi sur l'agenda de l'accueil (aujourd'hui / en retard) et dans le récapitulatif du matin, et se cochent des deux côtés (accueil et fiche) — même règle.

## L'accueil et l'assistant

- **Agenda** : les tâches datées et les étapes de parcours partenaire datées ; « en retard » = date passée et pas fait (30 jours au plus).
- **Phases de test** : une carte par parcours ouvert, J+x sur N jours, la prochaine étape qui attend quelqu'un et son acteur ; ambre sous 7 jours de la fin, rouge au-delà.
- **En chiffres** : CA mensuel HT (voir Historique), clients actifs (statut Gagnée), opportunités ouvertes (statuts du pipeline), tickets ouverts (non résolus).
- **Graphique des mois** : CA HT attendu (bâtons), nouveaux prospects = fiches créées ce mois-là (y compris imports), clients signés = date de signature ce mois-là.
- **Assistant** (bulle en bas à droite) : deux onglets. « À faire » — les rappels, calculés sans IA ; « Discussion » — Claude (Haiku 4.5), qui lit le support par des outils en lecture seule et répond ; chaque rappel a un « ? » qui lui pose la question. Garde-fous : un plafond de questions par jour et par compte, un plafond de dépense en euros par jour tous comptes confondus (10 € par défaut, compté depuis les tokens et persisté), et le plafond mensuel de la console Anthropic.
- **Rappels de l'assistant** : une phrase par sujet, jamais à zéro — réponses client non lues, tickets urgents/nouveaux, relevés en retard, parcours arrêtés sur TIM (ou sur le partenaire), tests qui finissent sous 7 jours, tâches en retard, soumissions de mission, commandes de récompense, formulaires vitrine à reprendre, questions de développement, factures à valider, connexions en échec.

## Facturation : historique, CA, rapprochement

- **Licences** : par profil (admin, conducteur, chef de chantier, chef d'équipe, compagnon), une quantité et un prix unitaire HT par mois, remise possible par ligne. **CA HT / mois d'une fiche = Σ quantité × prix effectif.** Commission partenaire = CA × taux du partenaire.
- **Historique** d'une fiche : une ligne par mois (le 1er), écrite **à l'enregistrement de la fiche** quand elle est Gagnée, qu'une date de démarrage de facturation est connue (début de l'abonnement Pennylane, sinon la date de contrat) et que la configuration (quantités × prix, taux) a **changé**. Un mois sans ligne **reporte** la dernière ligne connue. Une fiche résiliée garde son historique ; en pipeline ou en test, pas d'historique (les licences sont un devis).
- **CA mensuel** (accueil, Analyses) = Σ, sur les fiches dont le contrat a démarré et n'est pas résilié ce mois-là, de la ligne d'historique en vigueur en fin de mois.
- **Pennylane** : la comptabilité. On y lit (jamais écrit) les clients (rapprochés par SIREN, sinon par nom), les abonnements et leurs lignes (ce que la prochaine facture contiendra), les factures et leur état de paiement. Instantané en cache une heure.
- **Rapprochement** (`/admin/facturation`) : fiche contre abonnement, profil par profil. Verdicts : conforme, écart (quantité, prix, lignes en trop, périodicité, retard de paiement, facture manquante…), sans abonnement, non rapproché (client introuvable). Les factures partent le 4 du mois pour la plupart, le 15 pour certains ; le client paie le mois qu'il vit ; une modification prend effet à la facture suivante.
- **Validation du mois** : la case « Conforme » signe que fiche et abonnement disent la même chose pour la **prochaine facture** (mois de `next_occurrence`). Elle écrit la ligne d'historique de ce mois (configuration, tampon Pennylane, qui, quand). Bloquée par un écart de quantité, prix, lignes, abonnement, SIREN, périodicité ; **pas** par un retard de paiement. Si la fiche change après signature → « à revalider ». Une validation couvre jusqu'au jour de sa facture ; ensuite le mois suivant est à valider. Une licence ajoutée ou retirée se modifie **le même jour** sur la fiche et sur l'abonnement.
- **Rappels** : le 1er du mois (admins), ce qui reste à signer ; à J-2 d'une facture non signée (admins + équipe), dernier appel.
- Sous les graphiques : un mois est « validé » quand toutes les fiches facturées ce mois-là sont signées, sinon « x/y validés » ou « estimé ».

## Leads du site vitrine

- Un formulaire soumis crée **immédiatement** une opportunité « Nouvelle » chez le partenaire du site vitrine, avec le téléphone, les besoins et l'origine (SEO, Google Ads, ChatGPT Ads). Si le prospect est déjà connu (même e-mail, sinon même téléphone), la demande est journalisée sur sa fiche.
- E-mail mal formé ou téléphone illisible : la fiche est créée **quand même**, avec une **réserve** (alerte « non conforme » en tête de fiche et badge sur la carte) qui disparaît quand le champ est corrigé. L'e-mail devient obligatoire à la phase de test.
- « À reprendre » = soumissions en échec (rien créé) ou en brouillon (ancien comportement).

## Rôles

- **Admin** : tout. **Support** : les tickets. **Partenaire-métier** : ses opportunités, ses parcours, ses tâches, ses commissions ; il valide ses étapes de parcours. **Partenaire-utilisateur** : ses missions, points et récompenses.
- L'assistant répond avec les données du rôle de la personne connectée, en lecture seule ; il ne modifie rien et ne voit ni clés ni mots de passe.
