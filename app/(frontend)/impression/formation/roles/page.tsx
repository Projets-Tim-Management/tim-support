import { headers } from "next/headers";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { canPrintTraining, loadTrainingPrint, slotsForProfile } from "@/modules/training/lib/print-data";
import { PROFILS } from "@/modules/partner/lib/pricing";
import { RoleSheet } from "@/modules/training/print/RoleSheet";

import PrintNow from "../../acces/PrintNow";

/**
 * « Fiches par rôle » d'une formation, à imprimer : une page par profil formé —
 * quand, ce qui sera abordé (son programme), ses premières fonctionnalités et
 * comment démarrer. Sans mot de passe : TIM et les formateurs de la formation.
 */
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ training?: string }> }) {
  const { training } = await searchParams;
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: await headers() });
  if (!training) return <p className="p-10 text-muted">Aucune formation indiquée.</p>;
  if (!(await canPrintTraining(payload, user, training, hasAdminRole(user)))) {
    return <p className="p-10 text-muted">Réservé à l&apos;équipe TIM et aux formateurs de cette formation.</p>;
  }
  const data = await loadTrainingPrint(payload, training, { withPasswords: false });
  if (!data) return <p className="p-10 text-muted">Formation introuvable.</p>;

  const profiles = PROFILS.map((p) => p.key as string).filter((k) => data.sessions.some((s) => (s.profiles ?? []).includes(k)));
  return (
    <div className="px-8 py-10 print:px-0 print:py-0 [&>div:first-of-type]:break-before-auto">
      <PrintNow />
      {profiles.length === 0 && <p className="text-muted">Aucun créneau dans cette formation.</p>}
      {profiles.map((p) => (
        <RoleSheet
          key={p}
          profile={p}
          companyName={data.companyName}
          modules={data.programmes.find((x) => x.profile === p)?.modules ?? []}
          slots={slotsForProfile(data, p)}
          gestures={data.gestures[p] ?? []}
          site={data.site}
        />
      ))}
    </div>
  );
}
