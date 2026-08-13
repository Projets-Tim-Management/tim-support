import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { payloadClient } from "@/core/payload-client";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { LICENCE_PROFILE_OPTIONS } from "@/modules/marketing/lib/onboarding";

export const metadata: Metadata = {
  title: "Mes accès TIM",
  robots: { index: false, follow: false },
};

const PROFILE_LABEL: Record<string, string> = Object.fromEntries(
  LICENCE_PROFILE_OPTIONS.map((p) => [p.value, p.label]),
);

type Credential = {
  id: number | string;
  firstName?: string;
  lastName?: string;
  licenceProfile?: string;
  username?: string;
  password?: string;
};

/**
 * « Mes accès » — une vignette par utilisateur, à imprimer et à découper.
 *
 * C'est le client qui distribue les accès à ses équipes : beaucoup de compagnons
 * n'ont pas d'adresse e-mail professionnelle, et un identifiant remis en main
 * propre en réunion de chantier arrive à destination. D'où le format « fiches à
 * découper » plutôt qu'un tableau.
 *
 * Ces identifiants ne transitent JAMAIS par e-mail : ils ne s'affichent que
 * derrière une session ouverte, et la lecture est filtrée sur l'entreprise du
 * cookie signé.
 */
export default async function AccesPage() {
  const ctx = await getPortalClient();
  if (!ctx) redirect("/espace-client");

  const payload = await payloadClient();
  const res = await payload.find({
    collection: "client-credentials",
    where: { client: { equals: ctx.client.id } },
    sort: "lastName",
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });
  const credentials = res.docs as Credential[];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4 print:hidden">
        <div>
          <Link href="/espace-client/accueil" className="text-sm text-muted hover:underline">
            ← Mon espace
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Mes accès TIM</h1>
          <p className="mt-2 text-muted">
            {credentials.length} accès. Imprimez la page&nbsp;: chaque encadré se découpe et se remet
            à la personne concernée.
          </p>
        </div>
      </div>

      <p className="mb-6 rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text print:hidden">
        Ces identifiants sont confidentiels. Ils ne vous sont jamais envoyés par e-mail&nbsp;: ils ne
        s&apos;affichent qu&apos;ici, une fois connecté.
      </p>

      {credentials.length === 0 ? (
        <p className="text-muted">
          Vos accès ne sont pas encore prêts. Nous vous prévenons dès qu&apos;ils le sont.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {credentials.map((c) => (
            <article
              key={String(c.id)}
              className="rounded-lg border border-dashed border-border bg-white p-4 break-inside-avoid"
            >
              <p className="font-semibold text-foreground">
                {[c.firstName, c.lastName].filter(Boolean).join(" ")}
              </p>
              {c.licenceProfile && (
                <p className="text-xs text-muted">{PROFILE_LABEL[c.licenceProfile] ?? c.licenceProfile}</p>
              )}
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">Identifiant</dt>
                  <dd className="font-mono text-foreground">{c.username}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">Mot de passe</dt>
                  <dd className="font-mono text-foreground">{c.password}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
