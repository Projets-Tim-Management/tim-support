import type { Metadata } from "next";

import { payloadClient } from "@/core/payload-client";
import { CLOSED_STATUSES } from "@/modules/marketing/lib/due-emails";
import {
  isSatisfactionLevel,
  readSatisfactionToken,
} from "@/modules/marketing/lib/satisfaction";

import AvisForm from "./AvisForm";

/**
 * Où atterrit un clic sur un visage de « Comment ça se passe ? ».
 *
 * La note arrive dans l'URL et s'enregistre TOUT DE SUITE : demander une
 * confirmation après un clic déjà fait, c'est perdre la moitié des réponses sur
 * la deuxième page.
 *
 * ⚠️ Conséquence assumée : certains filtres de messagerie visitent les liens
 * d'un message avant que le destinataire ne les ouvre, et peuvent donc poser une
 * note à sa place. D'où l'écran d'après — les cinq visages y sont réaffichés,
 * celui enregistré mis en avant, et un clic suffit à corriger. Sans cette
 * correction possible, l'enregistrement immédiat serait un piège.
 *
 * Aucune session demandée : le lien s'ouvre depuis une boîte mail, souvent sur
 * un téléphone. C'est le jeton signé qui désigne le parcours.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Merci pour votre retour",
  robots: { index: false, follow: false },
};

type Params = { token: string };
type Search = { note?: string };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { token } = await params;
  const { note } = await searchParams;

  const runId = readSatisfactionToken(token);
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
    .catch(() => null)) as {
    status?: string;
    satisfaction?: number | null;
    satisfactionComment?: string | null;
  } | null;

  if (!run || (run.status && CLOSED_STATUSES.includes(run.status))) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-xl font-bold text-foreground">Votre test est terminé</h1>
        <p className="mt-3 text-sm text-muted">
          Merci de votre intérêt. Répondez à notre e-mail si vous voulez nous en dire plus.
        </p>
      </main>
    );
  }

  const asked = Number(note);
  const chosen = isSatisfactionLevel(asked) ? asked : null;

  // Enregistrée AVANT le rendu : la page qui s'affiche est déjà la confirmation.
  if (chosen !== null && chosen !== run.satisfaction) {
    await payload
      .update({
        collection: "journey-runs",
        id: runId,
        data: { satisfaction: chosen, satisfactionAt: new Date().toISOString() } as never,
        overrideAccess: true,
      })
      .catch((err) => payload.logger.error(`[avis] parcours ${runId} : ${err}`));
  }

  return (
    <AvisForm
      token={token}
      value={chosen ?? run.satisfaction ?? null}
      comment={run.satisfactionComment ?? ""}
    />
  );
}
