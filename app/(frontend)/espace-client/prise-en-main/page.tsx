import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import SlotPicker from "@/components/portal/SlotPicker";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

export const metadata: Metadata = {
  title: "Session de prise en main",
  robots: { index: false, follow: false },
};

export default async function PriseEnMainPage() {
  const ctx = await getPortalClient();
  if (!ctx) redirect("/espace-client");

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/espace-client/accueil" className="text-sm text-muted hover:underline">
        ← Mon espace
      </Link>

      <header className="mt-2 mb-8">
        <h1 className="text-3xl font-bold text-foreground">Session de prise en main</h1>
        <p className="mt-2 text-muted">
          45 minutes avec votre interlocuteur, avec vos conducteurs et vos chefs de chantier. Les
          entreprises qui font cette session démarrent vraiment dès la première semaine.
        </p>
      </header>

      <SlotPicker />
    </div>
  );
}
