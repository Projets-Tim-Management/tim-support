import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import DossierSubmit from "@/components/portal/DossierSubmit";
import { payloadClient } from "@/core/payload-client";
import {
  IconBuilding,
  IconCheck,
  IconMachine,
  IconTruck,
  IconUser,
  IconUsers,
} from "@/components/ui/icons";
import { PORTAL_SECTIONS } from "@/modules/marketing/lib/portal-sections";
import { isDossierLocked } from "@/modules/marketing/lib/onboarding";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

/**
 * Une icône par section, associée à sa CLÉ.
 *
 * Les sections sont décrites dans portal-sections.ts, qui pilote aussi le
 * formulaire et la validation serveur : y ajouter du dessin mêlerait la règle
 * métier à la présentation. La correspondance vit donc ici, dans l'écran qui
 * l'utilise, et une section sans icône reste affichée — sans icône.
 */
const SECTION_ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  administrateur: IconUser,
  salaries: IconUsers,
  chantiers: IconBuilding,
  vehicules: IconTruck,
  engins: IconMachine,
};

export const metadata: Metadata = {
  title: "Dossier de démarrage",
  robots: { index: false, follow: false },
};



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

  const locked = isDossierLocked(ctx.client.onboardingStatus);
  const transmis = ctx.client.onboardingStatus === "transmis";
  const complete = counts.every(({ section, total }) => section.min === 0 || total >= section.min);
  const done = counts.filter(({ section, total }) => section.min === 0 || total >= section.min).length;
  // Les facultatives comptent comme complètes : ce qui BLOQUE la transmission,
  // ce sont les obligatoires encore vides.
  const restantes = counts.filter(({ section, total }) => section.min > 0 && total < section.min).length;

  return (
    <div className="px-6 py-10 sm:px-8">
      <Link href="/espace-client/accueil" className="text-sm text-muted hover:underline">
        ← Mon espace
      </Link>

      <header className="mt-2 mb-8">
        <h1 className="text-3xl font-bold text-foreground">Dossier de démarrage</h1>
        {/* La page prend toute la largeur, la prose garde la sienne. */}
        <p className="mt-2 max-w-2xl text-muted">
          Ces informations nous permettent de préparer votre environnement TIM avant le début du
          test.
        </p>
      </header>

      {/* Avancement : un segment par section, dans l'ordre où elles sont
          listées en dessous. Un pourcentage global ne dirait pas OÙ on en est ;
          ici la barre et les cartes se lisent l'une avec l'autre. */}
      <section className="mb-8 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="font-semibold text-foreground">Votre dossier</span>
          <span className="text-muted">
            {done} sur {PORTAL_SECTIONS.length} sections
          </span>
        </div>

        <div
          className="mt-2 flex gap-1.5"
          role="img"
          aria-label={`${done} sections complètes sur ${PORTAL_SECTIONS.length}`}
        >
          {counts.map(({ section, total }) => (
            <span
              key={section.key}
              className={`h-1.5 flex-1 rounded-full ${
                section.min === 0 || total >= section.min ? "bg-success" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* Ce qui reste vraiment à faire : les sections facultatives comptent
            comme complètes sans qu'on y ait touché, et gonflent le compteur.
            Sans cette ligne, « 2 sur 5 » laisse croire à un travail entamé. */}
        <p className="mt-3 text-sm text-foreground">
          {restantes === 0 ? (
            complete ? (
              <>Tout est complet — vous pouvez transmettre votre dossier.</>
            ) : (
              <>Les sections obligatoires sont complètes.</>
            )
          ) : (
            <>
              Il reste <strong>{restantes}</strong> section{restantes > 1 ? "s" : ""} obligatoire
              {restantes > 1 ? "s" : ""} à compléter.
            </>
          )}
        </p>
      </section>

      {/* Des cartes, pas des lignes : la section se choisit d'un coup d'œil à
          son icône et à son état, sans lire. Chacune est cliquable en entier —
          viser un libellé de trois mots dans une ligne pleine largeur était le
          geste le plus étroit de tout l'espace. */}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {counts.map(({ section, total }) => {
          const ok = section.min === 0 || total >= section.min;
          const Icon = SECTION_ICONS[section.key];
          return (
            <li key={section.key}>
              <Link
                href={`/espace-client/dossier/${section.key}`}
                className="group flex h-full flex-col rounded-lg border border-border bg-white p-5 transition hover:border-primary hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition ${
                      ok
                        ? "bg-success-bg text-success-text"
                        : "bg-surface text-muted group-hover:bg-primary-light group-hover:text-primary"
                    }`}
                    aria-hidden
                  >
                    {Icon && <Icon className="h-6 w-6" />}
                  </span>

                  {/* Coche dessinée plutôt que le glyphe « ✔ » : celui-ci change
                      de dessin selon la police du système, et se retrouve rendu
                      en émoji sur certains appareils. */}
                  {ok && (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-success-bg text-success-text"
                      aria-hidden
                    >
                      <IconCheck className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>

                <span className="mt-4 block font-semibold text-foreground">{section.label}</span>
                <span className="mt-1 block text-sm text-muted">
                  {total} ligne{total > 1 ? "s" : ""}
                  {section.min === 0 && " · facultatif"}
                  {!ok && section.min > 0 && " · à compléter"}
                </span>

                <span className="mt-4 text-sm font-semibold text-primary group-hover:underline">
                  {total > 0 ? "Modifier" : "Compléter"} →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-8">
        {locked ? (
          <p className="rounded-md bg-success-bg px-4 py-3 text-sm text-success-text">
            Dossier validé par TIM. Il n&apos;est plus modifiable — contactez-nous si une information
            doit changer.
          </p>
        ) : transmis ? (
          // Transmis mais pas encore validé : le client peut CORRIGER. C'est le
          // cas courant — un salarié oublié, un chantier ouvert entre-temps —
          // et l'obliger à passer par un e-mail pour une ligne serait absurde.
          <div className="rounded-md bg-surface px-4 py-3">
            <p className="text-sm text-foreground">
              <strong>Dossier transmis.</strong> Nous le contrôlons avant de créer vos accès.
            </p>
            <p className="mt-1 text-sm text-muted">
              Vous pouvez encore le corriger tant que nous ne l&apos;avons pas validé : vos
              modifications nous parviennent directement, sans rien avoir à retransmettre.
            </p>
          </div>
        ) : (
          <DossierSubmit ready={complete} />
        )}
      </div>
    </div>
  );
}
