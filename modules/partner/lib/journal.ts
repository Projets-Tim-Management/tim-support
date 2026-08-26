import type { PayloadRequest } from "payload";

import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";

/**
 * Journal automatique d'une opportunité : ce que le système CONSTATE.
 *
 * Une fiche raconte mal son histoire toute seule — on voit son état, jamais le
 * chemin. Ces entrées comblent le trou : d'où vient le lead, quand il a changé
 * d'étape, quand le contrat a démarré. Écrites par les hooks, en lecture seule
 * dans la chronologie.
 *
 * ⚠️ L'écriture partage la TRANSACTION de l'enregistrement qui la déclenche.
 * Une erreur y est donc fatale : Payload annule la transaction entière avant
 * même que nous la voyions. L'« avaler » pour ne pas gêner l'utilisateur
 * produisait le pire résultat possible — la fiche répondait 200, la transaction
 * était morte, et rien n'était enregistré. On laisse donc l'erreur remonter :
 * mieux vaut un échec visible qu'une sauvegarde qui n'a pas eu lieu.
 */

type Payload = PayloadRequest["payload"];

export async function logActivity(
  payload: Payload,
  {
    client,
    title,
    content,
    req,
  }: {
    client: number | string;
    title: string;
    content?: string;
    req?: PayloadRequest;
  },
): Promise<void> {
  await payload.create({
    collection: "client-activities",
    data: {
      client: client as number,
      type: "systeme",
      title,
      content,
      occurredAt: new Date().toISOString(),
    },
    overrideAccess: true,
    req,
  });
}

const frDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : null;

const statusLabel = (value?: string | null) => clientStatusMeta(value)?.label ?? value ?? "—";

/**
 * Les faits d'une sauvegarde de fiche client qui méritent une ligne d'historique.
 *
 * Pure et testée : c'est elle qui décide, le hook ne fait qu'écrire. Seules les
 * TRANSITIONS comptent — réenregistrer une fiche sans rien changer ne doit pas
 * remplir la chronologie de bruit.
 */
export function journalEntries(
  doc: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
  operation: "create" | "update",
): { title: string; content?: string }[] {
  const out: { title: string; content?: string }[] = [];

  if (operation === "create") {
    out.push(
      doc.source === "site-vitrine"
        ? {
            title: "Lead reçu du site vitrine",
            content: typeof doc.leadNotes === "string" ? doc.leadNotes : undefined,
          }
        : { title: "Opportunité créée" },
    );
    // À la création, l'étape de départ fait partie du même fait : pas de seconde
    // ligne « statut → Nouvelle » qui n'apprendrait rien.
    return out;
  }

  if (doc.clientStatus !== previous?.clientStatus) {
    out.push({
      title: `Étape : ${statusLabel(previous?.clientStatus as string)} → ${statusLabel(doc.clientStatus as string)}`,
    });
  }
  if (doc.contractStartDate && !previous?.contractStartDate) {
    out.push({ title: `Contrat démarré le ${frDate(doc.contractStartDate as string)}` });
  }
  if (doc.signatureDate && !previous?.signatureDate) {
    out.push({ title: `Contrat signé le ${frDate(doc.signatureDate as string)}` });
  }
  if (doc.resiliationDate && !previous?.resiliationDate) {
    out.push({ title: `Fin de contrat au ${frDate(doc.resiliationDate as string)}` });
  }
  if (doc.onboardingStatus !== previous?.onboardingStatus) {
    const LABEL: Record<string, string> = {
      transmis: "Dossier de démarrage transmis par le client",
      valide: "Dossier de démarrage validé",
    };
    const label = LABEL[doc.onboardingStatus as string];
    if (label) out.push({ title: label });
  }

  return out;
}
