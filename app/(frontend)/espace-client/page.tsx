import type { Metadata } from "next";
import { redirect } from "next/navigation";

import PortalLogin from "@/components/portal/PortalLogin";
import { getPortalSession } from "@/modules/marketing/lib/portal-server";

export const metadata: Metadata = {
  title: "Espace client",
  description: "Connectez-vous à votre espace client TIM pour préparer votre phase de test.",
  robots: { index: false, follow: false },
};

/** Une session déjà ouverte n'a pas à repasser par la connexion. */
export default async function EspaceClientPage() {
  if (await getPortalSession()) redirect("/espace-client/accueil");

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Espace client</h1>
        <p className="mt-2 text-muted">
          Préparez votre phase de test&nbsp;: vos informations d&apos;entreprise et vos accès TIM.
        </p>
      </header>

      <PortalLogin />
    </div>
  );
}
