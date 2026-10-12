import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import Link from "next/link";

import { hasAdminRole } from "@/core/access";
import { Icons } from "@/admin/dashboard/icons";
import { DEV_EMAIL_TEMPLATES } from "@/modules/dev/lib/email-templates";

/**
 * Écran « Modèles d'e-mail » (/admin/dev/modeles-email, menu Développements → Paramètres).
 *
 * La liste des e-mails que le module envoie ; chacun s'ouvre sur son réglage
 * (textes, image, aperçu). Pour chaque modèle : quand il part, son objet
 * actuel et sa dernière modification — de quoi savoir lequel ouvrir sans les
 * ouvrir tous.
 */
const frDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;

export default async function DevEmailTemplatesView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  const { payload, user } = req;
  const isAdmin = hasAdminRole(user);

  const rows = isAdmin
    ? await Promise.all(
        DEV_EMAIL_TEMPLATES.map(async (t) => {
          const g = (await payload
            .findGlobal({ slug: t.slug as never, depth: 0, overrideAccess: true })
            .catch(() => null)) as { subject?: string | null; updatedAt?: string | null } | null;
          return { ...t, subject: g?.subject?.trim() || null, updatedAt: g?.updatedAt ?? null };
        }),
      )
    : [];

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <div className="dev-mails">
          <header className="dev-mails__head">
            <span className="dev-mails__icon">{Icons.mail()}</span>
            <div>
              <h1 className="dev-mails__title">Modèles d&apos;e-mail</h1>
              <p className="dev-mails__sub">Les e-mails envoyés par le suivi des développements. Ouvrez-en un pour modifier ses textes et son image.</p>
            </div>
          </header>

          {!isAdmin ? (
            <p className="dev-mails__empty">Cet écran est réservé aux administrateurs.</p>
          ) : (
            <ul className="dev-mails__list">
              {rows.map((r) => (
                <li key={r.slug}>
                  <Link className="dev-mails__card" href={`/admin/globals/${r.slug}`} prefetch={false}>
                    <span className="dev-mails__card-icon">{Icons.mail()}</span>
                    <span className="dev-mails__card-body">
                      <span className="dev-mails__name">{r.name}</span>
                      <span className="dev-mails__when">{r.when}</span>
                      {r.subject ? <span className="dev-mails__subject">Objet : {r.subject}</span> : null}
                    </span>
                    <span className="dev-mails__meta">
                      {r.updatedAt ? `Modifié le ${frDate(r.updatedAt)}` : "Texte d'origine"}
                      <span className="dev-mails__arrow">{Icons.arrowRight()}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
