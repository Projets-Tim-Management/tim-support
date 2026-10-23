import { notFound } from "next/navigation";

import AppV2Landing, { APP_V2_METADATA } from "@/components/app-v2/AppV2Landing";
import { payloadClient } from "@/core/payload-client";
import { appV2HostId } from "@/modules/marketing/lib/app-v2";
import { signatureFromPartner } from "@/modules/partner/lib/signature";

/**
 * /app-mobile-v2/<interlocuteur> — la présentation de la V2, avec le rendez-vous
 * dans l'agenda de cet interlocuteur. Seuls ceux de la liste APP_V2_HOSTS ont
 * une page ; une autre adresse est introuvable.
 */
export const metadata = APP_V2_METADATA;

// Nom, fonction et photo viennent de la fiche partenaire : relus au plus une
// fois par heure, une correction de fiche suit d'elle-même.
export const revalidate = 3600;

export default async function AppV2HostPage({ params }: { params: Promise<{ hote: string }> }) {
  const { hote } = await params;
  const hostId = appV2HostId(hote);
  if (hostId == null) notFound();

  const payload = await payloadClient();
  const fiche = (await payload
    .findByID({ collection: "partners", id: hostId, depth: 1, overrideAccess: true })
    .catch(() => null)) as Record<string, unknown> | null;
  const sig = signatureFromPartner(fiche);

  return (
    <AppV2Landing
      host={{
        slug: hote,
        name: sig.name || "Tim Management",
        jobTitle: [sig.jobTitle, sig.company].filter(Boolean).join(" · ") || null,
        photoUrl: sig.photoUrl ?? null,
      }}
    />
  );
}
