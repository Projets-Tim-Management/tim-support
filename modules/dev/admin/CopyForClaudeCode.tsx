"use client";

import { toast } from "@payloadcms/ui";

import { CLAUDE_CODE_STEPS, claudeCodePrompt } from "@/modules/dev/lib/claude-code-prompt";

/**
 * Copie la consigne qui fait coder une demande de développement par Claude
 * Code, avec la marche à suivre : ouvrir le dossier tim-support dans VS Code,
 * ouvrir Claude Code, coller. Rien ne s'ouvre ni ne part tout seul.
 */
export function CopyForClaudeCode({ dev }: { dev: { id: number | string; title: string } }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(claudeCodePrompt(dev));
      toast.success("Consigne copiée : collez-la dans Claude Code, le dossier tim-support ouvert dans VS Code.");
    } catch {
      toast.error("Copie impossible depuis ce navigateur : sélectionnez le texte de la consigne à la main.");
    }
  };
  return (
    <div className="dev-claude-code">
      <button type="button" className="tim-btn tim-btn--primary" onClick={copy}>
        Copier la consigne pour Claude Code
      </button>
      <small>{CLAUDE_CODE_STEPS}</small>
    </div>
  );
}
