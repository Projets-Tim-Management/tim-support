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

`npm run build` n'est pas facultatif avant un push : Vercel le rejouera, et une
erreur de build découverte là-bas laisse la production sur la version
précédente sans que personne ne le remarque tout de suite.

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
`main`, jamais l'inverse :

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

# 3. Rejouer les tests SUR LE MERGE (un merge propre peut casser)
ln -s "$PWD/node_modules" "$WT/node_modules"
cd "$WT" && npx vitest run

# 4. Déployer
git -C "$WT" push origin main

# 5. Nettoyer
rm -f "$WT/node_modules" && git worktree remove "$WT" --force && git worktree prune
```

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

Un `npm run build` local ne touche pas au schéma (le push est désactivé), il est
donc sans danger pour la production.

## Après le déploiement

Dire clairement à l'utilisateur :

- ce qui change **visiblement** pour les clients et l'équipe ;
- ce qui **ne se rattrape pas tout seul** sur les données existantes — une
  correction de code ne répare pas l'historique déjà écrit.
