#!/usr/bin/env node
/**
 * Rappelle la procédure du projet avant un `git commit` ou un `git push`.
 *
 * POURQUOI UN HOOK, ET PAS UNE NOTE. Une note de mémoire est lue au démarrage
 * de la session, puis noyée dans une heure de conversation : au moment qui
 * compte — la seconde avant le commit — elle est loin. Le hook, lui, s'exécute
 * juste avant l'outil et remet la procédure sous les yeux à ce moment précis.
 *
 * Il n'INTERDIT rien : il injecte du contexte. Un garde-fou qui bloque se
 * contourne, et une procédure qu'on doit contourner cesse d'être suivie. Le
 * rappel arrive au bon moment, la décision reste humaine.
 *
 * Écrit en Node plutôt qu'en shell : le projet en est un, la détection se relit
 * à voix haute, et il n'y a pas de citation à échapper trois fois.
 *
 * Déclaré dans .claude/settings.json (PreToolUse, matcher Bash).
 * Procédure complète : docs/COMMIT-ET-DEPLOIEMENT.md
 */

const PORTES = `Les quatre portes du projet, dans cet ordre — chacune attrape ce que la précédente ne voit pas :
  1. npx vitest run       → 100 % au vert
  2. npx tsc --noEmit     → aucune erreur
  3. npx eslint .         → 0 erreur ET 0 avertissement
  4. npm run build        → compile (Vercel le rejouera : une erreur découverte là-bas laisse la prod sur la version précédente)`;

const COMMIT = `RAPPEL — commit (docs/COMMIT-ET-DEPLOIEMENT.md)

${PORTES}

Puis :
  • indexer les chemins UN PAR UN. Jamais \`git add -A\` ni \`git add .\` : le
    dossier contient souvent du travail en cours qui n'est pas celui du commit.
    Des modifications qu'on n'a pas écrites ? Les signaler à l'utilisateur et le
    laisser décider de les inclure.
  • \`next-env.d.ts\` est GÉNÉRÉ et bascule dev/build : le restaurer
    (\`git checkout -- next-env.d.ts\`) plutôt que le committer.
  • message en français, « Domaine : ce que ça fait », puis le POURQUOI — le
    diff dit déjà le quoi. Finir par le trailer Co-Authored-By.`;

const PUSH = `RAPPEL — push (docs/COMMIT-ET-DEPLOIEMENT.md)

${PORTES}

\`refonte-support\` est la branche de travail ; \`main\` est la production.`;

const PROD = `⚠️ DÉPLOIEMENT EN PRODUCTION — pousser sur \`main\` met en ligne
support.tim-management.co (déploiement Vercel automatique).

  • INTERDIT sans accord EXPLICITE de l'utilisateur, formulé dans le message en
    cours. Une autorisation donnée pour un déploiement ne vaut pas pour le
    suivant. Note : \`.claude/settings.local.json\` autorise \`git push *\` sans
    confirmation — la retenue ne viendra donc pas du harnais.
  • Merger dans un WORKTREE (\`git worktree add\`), jamais en changeant de branche
    dans le dossier de travail : un serveur de dev qui tourne réécrirait les
    fichiers générés.
  • Rejouer les tests SUR LE MERGE avant de pousser : un merge sans conflit peut
    tout de même casser.
  • Base Supabase PARTAGÉE entre dev et prod, \`push: false\` : tout changement de
    schéma passe par \`npm run db:migrate:create\` puis \`:apply\`.

Après le déploiement, dire ce qui change visiblement — et ce qui ne se rattrape
PAS tout seul sur les données déjà écrites.`;

/**
 * Détection volontairement LARGE.
 *
 * Un faux positif ne coûte qu'un rappel de trop ; un faux négatif laisse passer
 * exactement le geste qu'on voulait accompagner. On ne cherche donc pas à
 * analyser la ligne de commande — `git -C "$WT" push origin main`,
 * `cd x && git commit -m "…"` et les formes composées doivent toutes matcher.
 */
const concerne = (commande, verbe) =>
  /\bgit\b/.test(commande) && new RegExp(`\\b${verbe}\\b`).test(commande);

/**
 * La production, c'est `main` — mais nommée SUR LA MÊME LIGNE que le push.
 *
 * Chercher le mot partout dans la commande était trop large : un message de
 * commit qui parle de `main` déclenchait l'avertissement de déploiement sur un
 * simple push de branche de travail. Or c'est exactement ainsi qu'un
 * avertissement meurt — à force d'arriver quand il ne fallait pas, on apprend à
 * le sauter, et il ne sert plus le jour où il compte.
 *
 * `[^\n]` interdit de franchir une ligne, ce qui écarte les corps de message ;
 * la fenêtre de 120 caractères couvre `git -C "<chemin>" push origin main`.
 */
const VERS_LA_PROD = /\bpush\b[^\n]{0,120}\bmain\b/;

const lireEntree = async () => {
  const morceaux = [];
  for await (const morceau of process.stdin) morceaux.push(morceau);
  return morceaux.join("");
};

const main = async () => {
  let commande = "";
  try {
    commande = JSON.parse(await lireEntree())?.tool_input?.command ?? "";
  } catch {
    return; // Entrée illisible : on se tait plutôt que de gêner.
  }

  const sections = [];
  if (concerne(commande, "commit")) sections.push(COMMIT);
  if (concerne(commande, "push")) {
    sections.push(PUSH);
    if (VERS_LA_PROD.test(commande)) sections.push(PROD);
  }
  if (sections.length === 0) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: sections.join("\n\n"),
      },
      suppressOutput: true,
    }),
  );
};

// Aucune erreur ne doit empêcher un commit : le rappel est une aide, pas un péage.
main().catch(() => {});
