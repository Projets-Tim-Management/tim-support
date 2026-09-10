import type { Metadata } from "next";

import { payloadClient } from "@/core/payload-client";
import { CLOSED_STATUSES } from "@/modules/marketing/lib/due-emails";
import { isClientDecision } from "@/modules/marketing/lib/journey";
import { readRunToken } from "@/modules/marketing/lib/run-token";

import DecisionForm from "./DecisionForm";

/**
 * Où atterrit un clic sur l'un des trois boutons de « votre décision ».
 *
 * ⚠️ Rien n'est enregistré à l'ouverture, contrairement aux cinq visages de
 * « Comment ça se passe ? ». Une note posée par erreur se corrige en un geste ;
 * une décision déclenche un devis ou clôt une relation commerciale. Or certains
 * filtres de messagerie visitent les liens d'un message AVANT son destinataire :
 * ils ouvriraient cette page, et décideraient à sa place.
 *
 * Le bouton cliqué arrive donc en PROPOSITION — mis en avant, à confirmer. Un
 * clic de plus, et c'est le bon endroit pour le dépenser.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Votre décision",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ choix?: string }>;
}) {
  const { token } = await params;
  const { choix } = await searchParams;

  const runId = readRunToken("decision", token);
  if (!runId) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-xl font-bold text-foreground">Ce lien n&apos;est plus valable</h1>
        <p className="mt-3 text-sm text-muted">
          Répondez directement à notre e-mail, on lit tout.
        </p>
      </main>
    );
  }

  const payload = await payloadClient();
  const run = (await payload
    .findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { status?: string; decision?: string | null } | null;

  if (!run || (run.status && CLOSED_STATUSES.includes(run.status))) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-xl font-bold text-foreground">Votre test est déjà clôturé</h1>
        <p className="mt-3 text-sm text-muted">
          Répondez à notre e-mail si vous voulez nous en dire plus.
        </p>
      </main>
    );
  }

  return (
    <DecisionForm
      token={token}
      // Le choix proposé par le bouton cliqué ; à défaut, celui déjà enregistré.
      suggested={isClientDecision(choix) ? choix : null}
      current={run.decision ?? null}
    />
  );
}
