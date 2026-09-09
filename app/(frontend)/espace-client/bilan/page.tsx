import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import ReviewPicker from "@/components/portal/ReviewPicker";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

export const metadata: Metadata = {
  title: "Bilan de fin de test",
  robots: { index: false, follow: false },
};

export default async function BilanPage() {
  const ctx = await getPortalClient();
  // Sans session, on passe par la connexion — en DISANT où l'on allait,
  // sinon le lien reçu par e-mail se perd sur l'accueil.
  if (!ctx) redirect("/espace-client?next=/espace-client/bilan");

  return (
    <div className="px-6 py-10 sm:px-8">
      <Link href="/espace-client/accueil" className="text-sm text-muted hover:underline">
        ← Mon espace
      </Link>

      <header className="mt-2 mb-8">
        <h1 className="text-3xl font-bold text-foreground">Bilan de fin de test</h1>
        <p className="mt-2 max-w-2xl text-muted">
          30 minutes avec votre interlocuteur, avant la fin de votre phase de test : ce qui a
          marché, ce qui vous a manqué, et la suite si vous voulez continuer.
        </p>
      </header>

      <div className="mx-auto max-w-3xl">
        <ReviewPicker />
      </div>
    </div>
  );
}
