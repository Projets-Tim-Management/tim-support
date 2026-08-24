import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { payloadClient } from "@/core/payload-client";
import LogoUpload from "@/components/portal/LogoUpload";
import TestTimeline from "@/components/portal/TestTimeline";
import PortalLogout from "@/components/portal/PortalLogout";
import { IconCalendar, IconCheck, IconClipboard, IconKey } from "@/components/ui/icons";
import { isStepDone } from "@/modules/marketing/lib/journey";
import { PORTAL_SECTIONS } from "@/modules/marketing/lib/portal-sections";
import { portalTimeline } from "@/modules/marketing/lib/portal-timeline";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

export const metadata: Metadata = {
  title: "Mon espace",
  robots: { index: false, follow: false },
};

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : null;

/** « 7 jours », « 1 jour », « aujourd'hui » — jamais « 0 jour ». */
const plural = (n: number) => (n <= 0 ? "aujourd'hui" : n === 1 ? "1 jour" : `${n} jours`);

/**
 * Accueil de l'espace client.
 *
 * Trois questions, dans cet ordre, parce que c'est l'ordre dans lequel elles se
 * posent quand on arrive : où en est mon test dans le temps, où en suis-je dans
 * ce qu'on attend de moi, et que dois-je faire maintenant.
 *
 * L'écran précédent n'en répondait aucune : trois cartes identiques, sans état
 * ni échéance, et rien qui distingue ce qui est fait de ce qui reste. Toutes les
 * données nécessaires étaient pourtant déjà chargées.
 *
 * Toutes les lectures sont filtrées sur `session.cid` (l'entreprise du cookie
 * signé), jamais sur un identifiant venu de l'URL.
 */
export default async function AccueilPage() {
  const ctx = await getPortalClient();
  if (!ctx) redirect("/espace-client");

  const { client, session } = ctx;
  const payload = await payloadClient();

  const [runs, credentials, account, ...sectionCounts] = await Promise.all([
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
    // Le prénom du contact, pour l'accueillir par son nom. Lu depuis la SESSION
    // (`aid`), jamais depuis l'URL : c'est la règle de tout le portail.
    payload
      .findByID({ collection: "client-portal-accounts", id: session.aid, depth: 0, overrideAccess: true })
      .catch(() => null),
    // Avancement réel du dossier, section par section — « 3 sur 5 » vaut mieux
    // que « à compléter », qui ne dit pas si on en est au début ou à la fin.
    ...PORTAL_SECTIONS.map((section) =>
      payload
        .count({
          collection: section.collection as "client-employees",
          where: { client: { equals: client.id } },
          overrideAccess: true,
        })
        .then((r) => ({ section, total: r.totalDocs }))
        .catch(() => ({ section, total: 0 })),
    ),
  ]);

  const run = runs.docs[0] as
    | {
        startDate?: string;
        endDate?: string;
        status?: string;
        sessionAt?: string;
        steps?: { key?: string; state?: string; autoAt?: string }[];
      }
    | undefined;
  const credentialCount = credentials.totalDocs ?? 0;
  const firstName = (account as { firstName?: string } | null)?.firstName?.trim();
  // `logo` arrive peuplé (depth 1) ; il reste un id si la relation est cassée.
  const logoUrl =
    client.logo && typeof client.logo === "object" ? (client.logo.url ?? null) : null;

  // La session est-elle DERRIÈRE nous ? Réserver n'est pas avoir suivi : c'est le
  // formateur qui constate qu'elle a eu lieu, en validant son étape. Entre les
  // deux, le client a fait sa part et attend — l'écran doit le dire plutôt que
  // de laisser croire à un blocage de son côté.
  const sessionStep = (run?.steps ?? []).find((s) => s.key === "prise-en-main");
  const sessionValidee = isStepDone(sessionStep ?? {});

  const sectionsDone = sectionCounts.filter(
    ({ section, total }) => section.min === 0 || total >= section.min,
  ).length;

  const dossierDone = ["transmis", "valide"].includes(client.onboardingStatus ?? "");

  // ── Le test dans le temps ─────────────────────────────────────────────────
  // Calcul sorti du composant : `react-hooks/purity` interdit `Date.now()` ici,
  // et surtout un calcul de dates se teste (voir tests/portal-timeline.test.ts).
  // Les faits que la frise ne peut pas déduire du parcours seul : ils vivent
  // sur la fiche client. Sans eux, ses jalons n'avanceraient qu'avec le temps.
  const time = portalTimeline(run, undefined, {
    dossierDone,
    credentialsReady: credentialCount > 0,
  });

  // ── Les trois jalons du client ────────────────────────────────────────────
  const jalons = [
    {
      key: "creneau",
      Icon: IconCalendar,
      title: "Session de prise en main",
      desc: "45 minutes avec votre interlocuteur, avant le démarrage. C'est ce qui fait la différence sur la première semaine.",
      done: Boolean(run?.sessionAt),
      doneLabel: sessionValidee
        ? `Session réalisée le ${fmt(run?.sessionAt)}`
        : run?.sessionAt
          ? `Réservée le ${fmt(run.sessionAt)}`
          : null,
      // Séance passée mais pas encore validée : ce n'est pas un fait acquis,
      // c'est une attente — et elle n'est pas du ressort du client.
      pending: time.sessionPast && !sessionValidee ? "En attente de validation par le formateur" : null,
      href: "/espace-client/prise-en-main",
      cta: run?.sessionAt ? "Voir mon créneau" : "Choisir mon créneau",
      progress: null as { done: number; total: number } | null,
    },
    {
      key: "dossier",
      Icon: IconClipboard,
      title: "Dossier de démarrage",
      desc: "Vos salariés, chantiers, véhicules et engins — ce qui nous permet de préparer votre environnement TIM.",
      done: dossierDone,
      doneLabel: client.onboardingStatus === "valide" ? "Validé par TIM" : dossierDone ? "Transmis" : null,
      pending:
        dossierDone && client.onboardingStatus !== "valide"
          ? "En attente de validation par l'équipe TIM"
          : null,
      href: "/espace-client/dossier",
      cta: dossierDone ? "Consulter mon dossier" : "Compléter mon dossier",
      progress: { done: sectionsDone, total: PORTAL_SECTIONS.length },
    },
    {
      key: "acces",
      Icon: IconKey,
      title: "Mes accès TIM",
      desc: "Les identifiants de vos utilisateurs, à imprimer et à remettre à vos équipes.",
      done: credentialCount > 0,
      doneLabel: credentialCount > 0 ? `${credentialCount} accès prêts` : null,
      pending: null as string | null,
      href: credentialCount > 0 ? "/espace-client/acces" : null,
      cta: credentialCount > 0 ? `Voir et imprimer mes ${credentialCount} accès` : null,
      waiting: "Nous les préparons — vous serez prévenu dès qu'ils sont prêts.",
      progress: null as { done: number; total: number } | null,
    },
  ];

  const jalonsDone = jalons.filter((j) => j.done).length;
  // L'étape courante est la première non faite qui dépend du CLIENT : les accès
  // ne sont pas de son ressort, les mettre en avant lui demanderait d'attendre.
  const currentKey = jalons.find((j) => !j.done && j.href)?.key;

  const welcome = !run?.startDate
    ? "Votre espace est ouvert. Vous y préparez votre phase de test à votre rythme."
    : jalonsDone === jalons.length
      ? "Tout est prêt de votre côté."
      : currentKey === "creneau"
        ? "Commencez par réserver votre session de prise en main : le reste suit."
        : "Il vous reste votre dossier de démarrage à compléter.";

  return (
    <div className="px-6 py-10 sm:px-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Le logo tient la place de la marque, à gauche du nom : c'est là
              qu'on le cherche, et là que son absence appelle le dépôt. */}
          <LogoUpload url={logoUrl} companyName={client.companyName} />
          <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">
            {client.companyName ?? "Mon espace"}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">
            {firstName ? `Bienvenue, ${firstName}` : "Bienvenue"}
          </h1>
          {/* La prose garde une largeur de lecture même si la page prend tout
              l'écran : une phrase étirée sur 1900 px ne se lit pas. */}
          <p className="mt-2 max-w-2xl text-muted">{welcome}</p>
          </div>
        </div>
        <PortalLogout />
      </header>

      {/* ── Où en est le test, dans le temps et dans les étapes ────────────── */}
      <section className="mb-8 rounded-lg border border-border bg-surface p-5 sm:p-6">
        {time.hasDates ? (
          <>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="font-semibold text-foreground">
                {time.started ? (
                  <>
                    Jour {time.dayOfTest} sur {time.totalDays}
                  </>
                ) : (
                  <>Démarrage dans {plural(time.daysToStart)}</>
                )}
              </span>
              <span className="text-muted">Survolez un point pour le détail</span>
            </div>

            <TestTimeline
              milestones={time.milestones}
              cursorPct={time.cursorPct}
              started={time.started}
            />
          </>
        ) : (
          <p className="text-sm text-muted">
            Les dates de votre phase de test vous seront confirmées par votre interlocuteur.
          </p>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="font-semibold text-foreground">Votre préparation</span>
            <span className="text-muted">
              {jalonsDone} sur {jalons.length}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5" role="img" aria-label={`${jalonsDone} étapes sur ${jalons.length}`}>
            {jalons.map((j) => (
              <span
                key={j.key}
                className={`h-1.5 flex-1 rounded-full ${
                  j.pending ? "bg-processing" : j.done ? "bg-success" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Les trois jalons ───────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {jalons.map((j, i) => {
          const current = j.key === currentKey;
          return (
            <section
              key={j.key}
              className={`flex flex-col rounded-lg border bg-white p-5 ${
                current ? "border-primary shadow-sm" : "border-border"
              } ${!j.done && !j.href ? "opacity-70" : ""}`}
            >
              <div className="flex items-center gap-3">
                {/* L'état se lit à la pastille, pas au texte : le numéro rappelle
                    l'ordre, la coche dit que c'est acquis. */}
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    j.pending
                      ? "bg-processing-bg text-processing-text"
                      : j.done
                        ? "bg-success-bg text-success-text"
                        : current
                          ? "bg-primary text-white"
                          : "bg-surface text-muted"
                  }`}
                  aria-hidden
                >
                  {j.done && !j.pending ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <h2 className="text-lg font-semibold text-foreground">{j.title}</h2>
                {/* L'icône identifie le jalon d'un coup d'œil, sans disputer sa
                    place au titre : à droite, discrète, et jamais colorée. */}
                <j.Icon className="ml-auto h-5 w-5 shrink-0 text-muted" />
              </div>

              <p className="mt-2 text-sm text-muted">{j.desc}</p>

              {j.progress && !j.done && (
                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-border">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${(j.progress.done / j.progress.total) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {j.progress.done} section{j.progress.done > 1 ? "s" : ""} sur {j.progress.total}
                  </p>
                </div>
              )}

              {j.done && j.doneLabel && (
                <p
                  className={`mt-3 text-sm font-medium ${
                    j.pending ? "text-processing-text" : "text-success-text"
                  }`}
                >
                  {j.doneLabel}
                </p>
              )}

              {/* Ce qui reste en attente, et de QUI. Sans cette précision, le
                  client cherche ce qu'il a encore à faire alors qu'il n'a plus
                  rien à faire. */}
              {j.pending && (
                <p className="mt-2 inline-flex rounded-md bg-processing-bg px-2.5 py-1 text-sm font-medium text-processing-text">
                  {j.pending}
                </p>
              )}

              {!j.done && !j.href && "waiting" in j && (
                <p className="mt-3 text-sm text-muted">{j.waiting}</p>
              )}

              {j.href && j.cta && (
                <Link
                  href={j.href}
                  className={`mt-4 inline-block self-start font-semibold ${
                    current ? "text-primary hover:underline" : "text-foreground hover:text-primary"
                  }`}
                >
                  {j.cta} →
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
