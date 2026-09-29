# Committer et déployer

Procédure du projet. Elle est **rappelée automatiquement** avant chaque
`git commit` et chaque `git push` par le hook `.claude/hooks/rappel-git.mjs`,
déclaré dans `.claude/settings.json` — il n'y a donc rien à se rappeler de tête,
ni à redemander à chaque fois.

---

## Les quatre portes, avant tout commit

Dans cet ordre. Chacune attrape ce que la précédente ne voit pas.

```bash
npx vitest run                  # 1. comportement
npx tsc --noEmit                # 2. types (couvre app/, modules/, core/, tests/)
npx eslint .                    # 3. 0 erreur ET 0 avertissement
npm run build                   # 4. compilation Next + Payload
```

> **Serveur de dev coupé, vérifié à chaque fois (règle du 29/09/2026).** Avant
> chaque `npm run build` et chaque migration, vérifier qu'aucun serveur de dev
> ne tourne (`pgrep -fl "next dev"`). S'il tourne, **demander à l'utilisateur
> de le couper** — ne pas le couper soi-même, ne pas lancer quand même. Il a
> pu être relancé depuis la dernière vérification : un build en parallèle
> partage le pooler Supabase (15 connexions) et peut échouer sans raison de code.

`npm run build` n'est pas facultatif avant un push : Vercel le rejouera, et une
erreur de build découverte là-bas laisse la production sur la version
précédente sans que personne ne le remarque tout de suite.

Le banc de test ne voit **jamais** la configuration du poste
(`tests/setup-isolation.ts`) : toute variable déclarée dans `.env.local` est
retirée, d'où qu'elle vienne, et `fetch` lève — un test simule ses réponses.
Charger `.env.local` dans le shell pour une commande Payload ne peut donc plus
exposer la base partagée ni les clés aux tests.

Le banc de test tourne en **UTC** (`tests/setup-tz.ts`), comme les fonctions
Vercel. C'est délibéré : un poste réglé sur Paris rendait invisibles les
erreurs de fuseau qui, elles, partaient bien chez les clients.

## Ce qu'on indexe

**Jamais `git add -A` ni `git add .`.** Le dossier de travail contient souvent
du travail en cours qui n'est pas celui du commit — et l'envoyer en production
sans relecture est arrivé. On indexe les chemins un par un.

Si des modifications qu'on n'a pas écrites traînent dans le dossier :
les mentionner à l'utilisateur et lui laisser la décision de les inclure.

`next-env.d.ts` bascule entre `.next/dev/types` et `.next/types` selon qu'on a
lancé `npm run dev` ou `npm run build`. C'est un fichier **généré** : le
restaurer (`git checkout -- next-env.d.ts`) plutôt que de le committer, sinon il
crée du bruit au prochain démarrage du serveur de dev.

## Le référentiel des règles

`docs/REGLES-SUPPORT.md` décrit comment chaque chiffre, état, rappel et rôle
du support est calculé. C'est ce que l'assistant (Claude) lit pour répondre —
et ce que l'équipe consulte quand un chiffre surprend.

**Avant chaque commit, se poser la question : ce commit change-t-il une règle
que ce document décrit, ou en ajoute-t-il une ?** Si oui, mettre le document à
jour dans le même commit (une règle absente = une réponse inventée ou un « je
ne sais pas »). Si non — un style, un correctif sans effet sur les règles, une
dépendance — ne pas y toucher : le document doit rester court et vrai.

## Le message de commit

En français, sur le modèle des commits existants :

```
Domaine : ce que ça fait

Le POURQUOI, pas le quoi — le diff dit déjà le quoi. Ce qui cassait, comment
on l'a constaté, et ce que la correction garantit désormais.
```

Un exemple qui a servi : « E-mails : heures de Paris, marquages qui aboutissent,
envois non dupliqués ».

Terminer par :

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

## Déployer en production

**`main` EST la production** (support.tim-management.co, déploiement Vercel
automatique au push). `refonte-support` est la branche de travail.

> **Jamais de push sur `main` sans accord explicite de l'utilisateur**, formulé
> dans le message en cours. Une autorisation donnée pour un déploiement ne vaut
> pas pour le suivant.

Le motif établi (23 commits identiques) est un merge de `refonte-support` dans
`main`, jamais l'inverse. Une branche de chantier (ex. `publicite`) passe par
`refonte-support` en avance rapide (`git fetch . publicite:refonte-support`) :

```bash
# 1. Pousser la branche de travail
git push origin refonte-support

# 2. Merger dans un WORKTREE, pas en changeant de branche.
#    Changer de branche dans le dossier de travail pendant qu'un serveur de dev
#    tourne fait réécrire les fichiers générés — d'où ce détour.
WT=/tmp/mergewt
git worktree add "$WT" main
git -C "$WT" merge --no-ff refonte-support \
  -m "Merge branch 'refonte-support' into main — <ce que ça apporte>"

# 3. Les QUATRE PORTES SUR LE MERGE (un merge propre peut casser),
#    serveur de dev COUPÉ (le build se connecte à la base, pooler plafonné à 15)
cp -Rc node_modules "$WT/node_modules"      # clone APFS : instantané, sans place
ln -s "$PWD/.env.local" "$WT/.env.local"
(cd "$WT" && npx vitest run && npx tsc --noEmit && npx eslint . && npm run build)
# Une porte échoue → on s'arrête ici : main n'a pas bougé sur GitHub.

# 4. Déployer
git -C "$WT" push origin main

# 5. Nettoyer
rm -f "$WT/.env.local"; rm -rf "$WT/node_modules"
git worktree remove "$WT" --force && git worktree prune
```

`node_modules` est **cloné**, pas lié : Turbopack refuse un `node_modules` en lien
symbolique qui sort du projet (« Symlink [project]/node_modules is invalid, it
points out of the filesystem root » — constaté le 29/09/2026). Le lien suffisait à
vitest, pas au build. Le clone n'est fidèle que si la branche ne touche pas
`package-lock.json` ; sinon, `npm ci` dans le worktree.

Vérifier au passage qu'aucun worktree fantôme ne traîne (`git worktree list` :
un dossier supprimé reste enregistré et bloque `git checkout main`).

## Base de données

`push: false` dans `payload.config.ts`, et **dev et prod partagent la même base
Supabase**. Tout changement de schéma passe par une migration explicite :

```bash
npm run db:migrate:create
npm run db:migrate:apply
npm run db:migrate:status
```

Ne jamais utiliser `payload migrate` directement : il gèle sur une invite
« data loss » en mode non interactif. Le helper `scripts/db-migrate.mjs` la
traite.

**Le schéma `public` reste fermé à l'API Supabase** (incident du 29/09/2026,
`docs/INCIDENT-2026-09-29-API-SUPABASE.md`). `db:migrate:apply` active RLS sur
les tables que chaque migration crée, puis lance le contrôle `npm run
db:security`, qui fait échouer la commande si une table est ouverte à `anon` /
`authenticated` ou sans RLS. Un échec de ce contrôle se traite avant toute
autre chose.

Avant d'appliquer : serveur de dev coupé (voir « Les quatre portes »), dump de
la base vérifié dans `~/tim-backups` (droits 600), et feu vert de
l'utilisateur.

> **Migration bloquée comme destructive : on s'arrête (règle du 29/09/2026).**
> Si `db:migrate:apply` refuse une migration parce qu'elle contient un
> statement destructif, **ne pas relancer avec `--allow-destructive`** de sa
> propre initiative, même avec un feu vert donné avant. Montrer d'abord à
> l'utilisateur les statements en cause et pourquoi ils sont sans perte (ou
> non), puis attendre son accord explicite pour forcer.

Un `npm run build` local ne touche pas au schéma (le push est désactivé), il est
donc sans danger pour la production.

## Après le déploiement

Dire clairement à l'utilisateur :

- ce qui change **visiblement** pour les clients et l'équipe ;
- ce qui **ne se rattrape pas tout seul** sur les données existantes — une
  correction de code ne répare pas l'historique déjà écrit.
