"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Ferme la session de l'espace client (le cookie est supprimé côté serveur). */
export default function PortalLogout() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/portal/logout", { method: "POST" });
        router.replace("/espace-client");
        router.refresh();
      }}
      className="shrink-0 text-sm text-muted underline hover:text-foreground disabled:opacity-50"
    >
      Se déconnecter
    </button>
  );
}
