"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";

import { claudeCodeLink } from "@/modules/dev/lib/claude-code-link";

/**
 * Sur une demande de développement : ouvre Claude Code dans VS Code avec la
 * demande déjà écrite. Le message n'est pas envoyé tout seul : on le relit,
 * puis on appuie sur Entrée. Il faut VS Code et l'extension Claude Code.
 */
export function OpenInClaudeCode() {
  const { id } = useDocumentInfo();
  const title = useFormFields(([f]) => f?.title?.value as string | undefined);
  if (!id) return null;
  return (
    <div className="dev-claude-code">
      <a className="tim-btn tim-btn--primary" href={claudeCodeLink({ id, title: title ?? "" })}>
        Ouvrir dans Claude Code
      </a>
      <small>Ouvre un onglet Claude Code dans VS Code, la demande déjà écrite : relisez-la, puis Entrée.</small>
    </div>
  );
}
