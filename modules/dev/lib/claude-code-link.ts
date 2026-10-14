/**
 * Le lien qui ouvre Claude Code dans VS Code avec une demande de
 * développement déjà écrite. C'est le lien documenté de l'extension
 * (vscode://anthropic.claude-code/open?prompt=…) : le message n'est PAS
 * envoyé tout seul — on le relit, puis on appuie sur Entrée. Pure.
 */
export function claudeCodeLink(dev: { id: number | string; title: string }): string {
  const prompt = [
    `Demande de développement n°${dev.id} : « ${dev.title} ».`,
    "Lis la fiche dans le Suivi des développements (collection « developments » : sa description donne le contexte et, pour un élément de motion design, tout son fil d'amélioration),",
    "propose ton plan, puis code-la en suivant docs/COMMIT-ET-DEPLOIEMENT.md. Ne pousse rien sans mon accord.",
  ].join(" ");
  return `vscode://anthropic.claude-code/open?prompt=${encodeURIComponent(prompt)}`;
}
