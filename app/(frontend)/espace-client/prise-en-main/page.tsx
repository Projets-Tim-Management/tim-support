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
    <div className="px-6 py-10 sm:px-8">
      <Link href="/espace-client/accueil" className="text-sm text-muted hover:underline">
        ← Mon espace
      </Link>

      <header className="mt-2 mb-8">
        <h1 className="text-3xl font-bold text-foreground">Session de prise en main</h1>
        {/* La page prend toute la largeur, la prose garde la sienne : une phrase
            étirée sur un grand écran ne se lit plus. */}
        <p className="mt-2 max-w-2xl text-muted">
          45 minutes avec votre interlocuteur, pour former l&apos;administrateur de votre compte —
          celui qui pilotera TIM au quotidien. Les entreprises qui font cette session démarrent
          vraiment dès la première semaine.
        </p>
      </header>

      {/* Seul le sélecteur est borné : un calendrier et une colonne d'horaires
          étalés sur toute la largeur éloignent le choix du jour de celui de
          l'heure — deux gestes qui se suivent et doivent rester à portée de
          regard. Le reste de la page suit la mise en page de l'espace. */}
      <div className="mx-auto max-w-3xl">
        <SlotPicker />
      </div>
    </div>
  );
}
