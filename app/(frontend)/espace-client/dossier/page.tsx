import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import DossierSubmit from "@/components/portal/DossierSubmit";
import { payloadClient } from "@/core/payload-client";
import { PORTAL_SECTIONS } from "@/modules/marketing/lib/portal-sections";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

export const metadata: Metadata = {
  title: "Dossier de démarrage",
  robots: { index: false, follow: false },
};

const LOCKED = ["transmis", "valide"];

/**
 * Sommaire du dossier : les 5 sections, ce qui est rempli, ce qui manque.
 *
 * Le bouton « Transmettre » n'apparaît que lorsque les sections obligatoires
 * sont servies — et le serveur le revérifie de toute façon (l'écran n'est pas
 * une garantie, c'est un confort).
 */
export default async function DossierPage() {
  const ctx = await getPortalClient();
  if (!ctx) redirect("/espace-client");

  const payload = await payloadClient();
  const counts = await Promise.all(
    PORTAL_SECTIONS.map(async (section) => ({
      section,
      total: (
        await payload.count({
          collection: section.collection as "client-employees",
          where: { client: { equals: ctx.client.id } },
          overrideAccess: true,
        })
      ).totalDocs,
    })),
  );

  const locked = LOCKED.includes(ctx.client.onboardingStatus ?? "");
  const complete = counts.every(({ section, total }) => section.min === 0 || total >= section.min);
  const done = counts.filter(({ section, total }) => section.min === 0 || total >= section.min).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/espace-client/accueil" className="text-sm text-muted hover:underline">
        ← Mon espace
      </Link>

      <header className="mt-2 mb-8">
        <h1 className="text-3xl font-bold text-foreground">Dossier de démarrage</h1>
        <p className="mt-2 text-muted">
          Ces informations nous permettent de préparer votre environnement TIM avant le début du
          test. {done}/{PORTAL_SECTIONS.length} sections complètes.
        </p>
      </header>

      <ul className="space-y-3">
        {counts.map(({ section, total }) => {
          const ok = section.min === 0 || total >= section.min;
          return (
            <li key={section.key}>
              <Link
                href={`/espace-client/dossier/${section.key}`}
                className="flex items-center gap-4 rounded-lg border border-border bg-white p-4 transition hover:border-primary"
              >
                <span className={ok ? "text-success" : "text-muted"}>{ok ? "✔" : "○"}</span>
                <span className="flex-1">
                  <span className="block font-semibold text-foreground">{section.label}</span>
                  <span className="block text-sm text-muted">
                    {total} ligne{total > 1 ? "s" : ""}
                    {section.min === 0 && " · facultatif"}
                    {!ok && section.min > 0 && " · à compléter"}
                  </span>
                </span>
                <span className="text-muted">›</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-8">
        {locked ? (
          <p className="rounded-md bg-success-bg px-4 py-3 text-sm text-success-text">
            Dossier transmis. Nous revenons vers vous s&apos;il manque quelque chose.
          </p>
        ) : (
          <DossierSubmit ready={complete} />
        )}
      </div>
    </div>
  );
}
