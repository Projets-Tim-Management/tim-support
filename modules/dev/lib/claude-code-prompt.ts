/**
 * La consigne à coller dans Claude Code pour faire coder une demande de
 * développement. On ouvre le dossier du projet (tim-support) dans VS Code, on
 * ouvre Claude Code, on colle : Claude lit la fiche et propose son plan. Pure.
 */
export function claudeCodePrompt(dev: { id: number | string; title: string }): string {
  return [
    `Demande de développement n°${dev.id} : « ${dev.title} ».`,
    "Lis la fiche dans le Suivi des développements (collection « developments » : sa description donne le contexte et, pour un élément de motion design, tout son fil d'amélioration),",
    "propose ton plan, puis code-la en suivant docs/COMMIT-ET-DEPLOIEMENT.md. Ne pousse rien sans mon accord.",
  ].join(" ");
}

/** La marche à suivre, affichée sous le bouton. */
export const CLAUDE_CODE_STEPS = "Ouvrez le dossier tim-support dans VS Code, ouvrez Claude Code, collez la consigne et appuyez sur Entrée.";
