import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { payloadClient } from "@/core/payload-client";
import PortalLogout from "@/components/portal/PortalLogout";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

export const metadata: Metadata = {
  title: "Mon espace",
  robots: { index: false, follow: false },
};

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : null;

/**
 * Accueil de l'espace client : où en est la phase de test, et les deux choses
 * que le client a à faire — compléter son dossier, récupérer ses accès.
 *
 * Toutes les lectures sont filtrées sur `session.cid` (l'entreprise du cookie
 * signé), jamais sur un identifiant venu de l'URL.
 */
export default async function AccueilPage() {
  const ctx = await getPortalClient();
  if (!ctx) redirect("/espace-client");

  const { client } = ctx;
  const payload = await payloadClient();

  const [runs, credentials] = await Promise.all([
    payload.find({
      collection: "journey-runs",
      where: { client: { equals: client.id } },
      sort: "-createdAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
    payload.count({
      collection: "client-credentials",
      where: { client: { equals: client.id } },
      overrideAccess: true,
    }),
  ]);

  const run = runs.docs[0] as
    | { startDate?: string; endDate?: string; status?: string; sessionAt?: string }
    | undefined;
  const credentialCount = credentials.totalDocs ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{client.companyName ?? "Mon espace"}</h1>
          {run?.startDate && (
            <p className="mt-2 text-muted">
              Phase de test du <strong className="text-foreground">{fmt(run.startDate)}</strong> au{" "}
              <strong className="text-foreground">{fmt(run.endDate)}</strong>
            </p>
          )}
        </div>
        <PortalLogout />
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">Session de prise en main</h2>
          <p className="mt-1 text-sm text-muted">
            45 minutes avec votre interlocuteur, avant le démarrage. C&apos;est ce qui fait la
            différence sur la première semaine.
          </p>
          <Link
            href="/espace-client/prise-en-main"
            className="mt-3 inline-block font-semibold text-primary hover:underline"
          >
            {run?.sessionAt ? "Voir mon créneau" : "Choisir mon créneau"}
          </Link>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">Dossier de démarrage</h2>
          <p className="mt-1 text-sm text-muted">
            Vos salariés, chantiers, véhicules et engins — ce qui nous permet de préparer votre
            environnement TIM.
          </p>
          <Link
            href="/espace-client/dossier"
            className="mt-3 inline-block font-semibold text-primary hover:underline"
          >
            {client.onboardingStatus === "valide"
              ? "Validé par TIM — consulter"
              : client.onboardingStatus === "transmis"
                ? "Transmis — consulter"
                : "Compléter mon dossier"}
          </Link>
        </section>

        <section className="rounded-lg border border-border bg-white p-5">
          <h2 className="text-lg font-semibold text-foreground">Mes accès TIM</h2>
          <p className="mt-1 text-sm text-muted">
            Les identifiants de vos utilisateurs, à imprimer et à remettre à vos équipes.
          </p>
          {credentialCount > 0 ? (
            <Link
              href="/espace-client/acces"
              className="mt-3 inline-block font-semibold text-primary hover:underline"
            >
              Voir et imprimer mes {credentialCount} accès
            </Link>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Pas encore disponibles — nous vous préviendrons dès qu&apos;ils sont prêts.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
