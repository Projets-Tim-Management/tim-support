"use client";

import { useState } from "react";

/** « 📋 Copier le prompt » : un prompt prêt à coller dans ChatGPT ou Claude, et sa lecture dépliable. */
export function CopyPromptButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="ait-obj__prompt">
      <button
        type="button"
        className="ait-obj__link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "✓ Prompt copié" : "📋 Copier le prompt"}
      </button>
      <details>
        <summary>Voir le prompt</summary>
        <pre className="ait-obj__pre">{prompt}</pre>
      </details>
    </span>
  );
}
