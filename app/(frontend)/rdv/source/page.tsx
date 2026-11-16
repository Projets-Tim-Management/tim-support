import type { Metadata } from "next";

import HeardFrom from "@/components/booking/HeardFrom";
import { isHeardFrom } from "@/modules/booking/lib/heard-from";

/**
 * /rdv/source?d=<référence signée de la demande>&r=<réponse> — le clic d'un bouton de l'e-mail d'accusé de réception
 * (« Comment nous avez-vous connus ? »). La réponse s'enregistre à l'AFFICHAGE de la page (un antivirus qui ouvre
 * le lien sans l'afficher ne compte pas) ; le prospect peut la corriger d'un autre clic.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Merci — TIM Management", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SourcePage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const demande = one(q.d) ?? null;
  const r = one(q.r);
  return (
    <main className="min-h-screen bg-surface px-4 py-16">
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">TIM Management</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Merci pour votre réponse !</h1>
        <p className="mt-2 text-foreground/75">Elle nous aide à savoir où les entreprises du BTP entendent parler de nous.</p>
        <HeardFrom demande={demande} initial={isHeardFrom(r) ? r : null} />
      </div>
    </main>
  );
}
