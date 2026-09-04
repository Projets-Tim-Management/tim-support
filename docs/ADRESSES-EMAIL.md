# Adresses e-mail — qui s'en sert

Inventaire des adresses du domaine et de ce qui en dépend **dans le code**.

Il existe parce qu'une adresse de groupe se réaffecte en deux clics dans
Workspace, sans que personne ne sache qu'un envoi automatique en dépendait. Une
adresse citée ici ne se renomme pas sans regarder la colonne « utilisée par ».

## Groupes Workspace (`@tim-management.co`)

| Adresse | Accès | Utilisée par le code |
|---|---|---|
| `suivi@` | **Public** | **Capture des échanges** — mise en Cci par un commercial, l'e-mail remonte dans l'historique de l'opportunité. Voir plus bas. |
| `support@` | Personnalisé | Expéditeur par défaut (`EMAIL_FROM`), notifications internes de tickets (`SUPPORT_NOTIFY_EMAIL`). |
| `info@` | Personnalisé | — (à ne pas confondre avec `info@tim-management.fr`, voir plus bas) |
| `contact@` `direction@` `dsi@` `finance@` `partenariat@` `sales@` `service@` `team@` | Personnalisé | Aucun usage dans le code à ce jour. |

## Adresses citées ailleurs

| Adresse | Où | Remarque |
|---|---|---|
| `info@tim-management.fr` | Expéditeur de la séquence « Marketing » | **Domaine `.fr`**, pas `.co`. Doit être un expéditeur VÉRIFIÉ chez Brevo, domaine authentifié, sinon l'envoi est refusé et l'échec n'apparaît que dans le journal. |
| `cpiancatelli@tim-management.co` | Expéditeur de repli de « Sans retour » | Les relances partent de l'adresse du partenaire de l'opportunité quand elle est utilisable ; celle-ci ne sert que sinon. |
| `<n>@REPLY_DOMAIN` | `ticket-`, `run-`, `seq-`, `suivi` | Sous-domaine dédié (`reply.tim-management.co`) dont les MX pointent vers **Brevo Inbound Parsing**, pas vers Google. |

## Capture des échanges — comment `suivi@` fonctionne

```
Le commercial met en Cci    suivi@tim-management.co     (groupe Workspace, Public)
        │
        ▼   le groupe a UN membre : suivi@reply.tim-management.co
   suivi@reply.tim-management.co                        (MX → Brevo)
        │
        ▼   Brevo Inbound Parsing → POST /api/inbound-email?key=…
   activité « e-mail » sur la fiche de l'opportunité
```

Trois conditions, et le silence est la seule alerte si l'une manque :

1. le groupe accepte les messages de **l'extérieur** (« Public ») — sans quoi
   tout ce qui vient d'une boîte non-Workspace est rejeté ;
2. il accepte un **membre externe** (`suivi@reply.tim-management.co`) ;
3. `EMAIL_CAPTURE_ADDRESS=suivi@tim-management.co` et `REPLY_DOMAIN` sont
   définis côté application.

### Ce qui est conservé, et ce qui ne l'est pas

On n'écrit **que** si une adresse du fil correspond à une opportunité déjà
connue — fiche ou contact. Sinon le message est lu, comparé, puis oublié : rien
n'est stocké. La finalité est le suivi d'un prospect, pas l'archivage d'une
correspondance.

Des pièces jointes on ne garde que **le nom**. « Je vous ai envoyé le devis » se
vérifie avec un nom et une date, sans détenir des documents que personne ne nous
a confiés.

Un message capté deux fois — deux commerciaux en copie du même fil, une reprise
du webhook — n'est écrit qu'une seule fois : le `Message-ID` fait foi.

## Boîtes mail connectées

Même règle de conservation, source différente : au lieu d'attendre une copie
cachée, on lit la boîte. **Partenaires → Boîtes mail**, bouton « Connecter ma
boîte mail ».

Réservé aux comptes `@tim-management.co` : l'écran de consentement OAuth du
projet Google est de type **Interne**, ce qui exempte le scope restreint
`gmail.readonly` de l'audit de sécurité annuel. **Le passer en « Externe »
coûterait plusieurs milliers d'euros par an** — c'est la raison d'être du client
OAuth séparé (`GOOGLE_MAIL_*`), distinct de celui des agendas.

L'ordre des opérations est la garantie : on lit les **métadonnées** d'abord, on
cherche l'opportunité, et on ne télécharge le **contenu** que des messages qui
en ont une. Le reste de la boîte n'est jamais lu.

Deux curseurs avancent en sens inverse — `syncedUpTo` pour le présent (avec un
jour de recouvrement), `backfillBefore` pour la reprise du passé, par tranches
d'un mois jusqu'à `syncSince`. Passage horaire (`/api/cron/mailbox-sync`).

**Couper.** Supprimer la ligne révoque l'autorisation chez Google — sinon la
personne continuerait d'y lire que nous avons accès à sa messagerie. Les
échanges déjà rattachés restent : ils appartiennent à l'historique des
opportunités. Pour les effacer aussi :

```
npx tsx scripts/mailbox-status.ts --purger=prenom.nom@tim-management.co
```
