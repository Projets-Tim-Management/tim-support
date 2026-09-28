import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { frDate } from "@/core/lib/dates";
import { payloadClient } from "@/core/payload-client";
import LogoUpload from "@/components/portal/LogoUpload";
import TestTimeline from "@/components/portal/TestTimeline";
import PortalLogout from "@/components/portal/PortalLogout";
import {
  IconBook,
  IconCalendar,
  IconChat,
  IconCheck,
  IconClipboard,
  IconKey,
  IconFile,
  IconHourglass,
  IconPen,
  IconReceipt,
  IconRoute,
} from "@/components/ui/icons";
import { getFeatures } from "@/modules/editorial/lib/content";
import { isStepDone, TEST_RUN_WHERE } from "@/modules/marketing/lib/journey";
import { PORTAL_SECTIONS } from "@/modules/marketing/lib/portal-sections";
import { portalTimeline } from "@/modules/marketing/lib/portal-timeline";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { awaitingCountersign, pendingContractUpdate } from "@/modules/partner/lib/e-signature-server";
import { PORTAL_STAGES, portalProgress, signingStarted } from "@/modules/partner/lib/signing";

export const metadata: Metadata = {
  title: "Mon espace",
  robots: { index: false, follow: false },
};

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
 * Une fois la phase de SIGNATURE ouverte, l'accueil change de centre : le
 * contrat d'abord (où en est-il, que faire), puis ce qui sert au quotidien
 * (accès, documents, factures), et la phase de test, terminée, se replie sur
 * une ligne — on peut la rouvrir, elle ne prend plus la page. Les factures
 * échues de chaque mois viendront s'afficher dans la carte « Mes factures ».
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
    // La phase de test seulement : c'est elle que racontent la frise et les
    // jalons. La mise en production a sa carte, « Signature ».
    payload.find({
      collection: "journey-runs",
      where: { and: [{ client: { equals: client.id } }, TEST_RUN_WHERE] },
      sort: "-createdAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    }),
    // Les accès prêts = les utilisateurs qui ont un mot de passe. L'ancienne
    // collection « accès de test » n'est plus alimentée : compter dessus laissait
    // la carte sur « nous les préparons » indéfiniment, et le client n'atteignait
    // jamais ses identifiants.
    payload.count({
      collection: "client-contacts",
      where: { client: { equals: client.id }, timPassword: { exists: true } },
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

  // ── Signature : l'affaire est conclue, ou le client a dit « Je continue » ──
  // L'accueil bascule alors sur le contrat (voir plus bas) ; les jalons ne
  // racontent plus que la phase de test.
  const signing = signingStarted(client as Record<string, unknown>);

  // ── Les jalons du client ──────────────────────────────────────────────────
  const testJalons = [
    {
      key: "creneau",
      Icon: IconCalendar,
      title: "Session de prise en main",
      desc: "45 minutes avec votre interlocuteur, avant le démarrage. C'est ce qui fait la différence sur la première semaine.",
      done: Boolean(run?.sessionAt),
      doneLabel: sessionValidee
        ? `Session réalisée le ${frDate(run?.sessionAt, "long")}`
        : run?.sessionAt
          ? `Réservée le ${frDate(run.sessionAt, "long")}`
          : null,
      // Séance passée mais pas encore validée : ce n'est pas un fait acquis,
      // c'est une attente — et elle n'est pas du ressort du client.
      pending: time.sessionPast && !sessionValidee ? "En attente de validation par le formateur" : null,
      href: "/espace-client/prise-en-main",
      cta: run?.sessionAt ? "Voir mon créneau" : "Choisir mon créneau",
      progress: null as { done: number; total: number; unit?: string } | null,
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
      progress: { done: sectionsDone, total: PORTAL_SECTIONS.length, unit: "section" } as {
        done: number;
        total: number;
        unit?: string;
      } | null,
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
      progress: null as { done: number; total: number; unit?: string } | null,
    },
  ];

  /** Sans phase de test (affaire conclue directement), pas de session à réserver. */
  const jalons = run ? testJalons : testJalons.filter((j) => j.key !== "creneau");

  const jalonsDone = jalons.filter((j) => j.done).length;
  // L'étape courante est la première non faite qui dépend du CLIENT : les accès
  // ne sont pas de son ressort, les mettre en avant lui demanderait d'attendre.
  const currentKey = jalons.find((j) => !j.done && j.href)?.key;

  const welcome = signing && run
    ? client.signatureDate
      ? "Votre phase de test est derrière vous. Voici l'essentiel pour la suite."
      : "Votre phase de test est terminée : il reste à finaliser votre contrat."
    : !run
    ? signing
      ? client.signatureDate
        ? "Votre contrat est signé. Bienvenue chez TIM !"
        : "Votre espace est ouvert : vous y finalisez la signature de votre contrat."
      : "Votre espace est ouvert."
    : currentKey === "signature"
      ? "Il vous reste à finaliser la signature : votre devis et votre contrat vous attendent."
      : !run.startDate
    ? "Votre espace est ouvert. Vous y préparez votre phase de test à votre rythme."
    : jalonsDone === jalons.length
      ? "Tout est prêt de votre côté."
      : currentKey === "creneau"
        ? "Commencez par réserver votre session de prise en main : le reste suit."
        : "Il vous reste votre dossier de démarrage à compléter.";

  // ── Phase de signature : l'état du contrat, en une phrase et un geste ──────
  const stages = portalProgress(client as Record<string, unknown>);
  const [update, awaitingTim] = signing
    ? await Promise.all([pendingContractUpdate(payload, client), awaitingCountersign(payload, client.id)])
    : [null, false];
  const isActive = (client as { clientStatus?: string }).clientStatus === "actif";
  const contract: { tone: "todo" | "wait" | "done"; title: string; desc: string; cta: string } = update
    ? {
        tone: "todo",
        title: "Une mise à jour de votre contrat vous attend",
        desc: "Relisez et signez la nouvelle version. Votre contrat actuel reste en vigueur jusqu'à votre signature.",
        cta: "Signer la mise à jour",
      }
    : stages.current !== "termine"
      ? {
          tone: "todo",
          title:
            stages.current === "entreprise"
              ? "Commencez par les informations de votre entreprise"
              : stages.current === "devis"
                ? "Votre devis vous attend"
                : "Votre contrat vous attend",
          desc: "Trois étapes, l'une après l'autre : les informations de votre entreprise, votre devis, puis votre contrat — tout se signe en ligne.",
          cta: "Finaliser la signature",
        }
      : awaitingTim
        ? {
            tone: "wait",
            title: "Vous avez signé : TIM contresigne à son tour",
            desc: "Vous recevrez votre exemplaire signé par les deux parties par e-mail, et il sera disponible ici.",
            cta: "Voir mes documents",
          }
        : isActive
          ? {
              tone: "done",
              title: "Votre contrat est signé, votre compte est actif",
              desc: client.signatureDate ? `Contrat signé le ${frDate(client.signatureDate, "long")}. Bienvenue chez TIM !` : "Bienvenue chez TIM !",
              cta: "Voir mes documents",
            }
          : {
              tone: "done",
              title: "Votre contrat est signé",
              desc: "Nous activons votre compte de production ; vous serez prévenu dès qu'il est prêt.",
              cta: "Voir mes documents",
            };

  // La phase de test en une ligne, quand elle est repliée.
  const testSummary = [
    run?.sessionAt ? `session le ${frDate(run.sessionAt, "long")}` : null,
    dossierDone ? (client.onboardingStatus === "valide" ? "dossier validé" : "dossier transmis") : null,
    credentialCount > 0 ? `${credentialCount} accès` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const testView = (
    <>
      {/* ── Où en est le test, dans le temps et dans les étapes ────────────── */}
      <section className="mb-8 rounded-lg border border-border bg-surface p-5 sm:p-6">
        {!run ? null : time.hasDates ? (
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

        <div className={run ? "mt-5 border-t border-border pt-4" : ""}>
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
                    {j.progress.done} {j.progress.unit ?? "section"}
                    {j.progress.done > 1 ? "s" : ""} sur {j.progress.total}
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

    </>
  );

  // Le nombre de fonctionnalités documentées, comme sur la page d'accueil
  // publique : annoncer un chiffre faux serait pire que ne pas en annoncer.
  const featureCount = (await getFeatures()).length;

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

      {signing ? (
        <>
          {/* ── Le contrat : où il en est, que faire ─────────────────────── */}
          <section
            className={`rounded-xl border p-6 sm:p-7 ${
              contract.tone === "todo" ? "border-primary bg-white shadow-sm" : "border-border bg-white"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    contract.tone === "done"
                      ? "bg-success-bg text-success-text"
                      : contract.tone === "wait"
                        ? "bg-processing-bg text-processing-text"
                        : "bg-primary-light text-primary"
                  }`}
                  aria-hidden
                >
                  {contract.tone === "done" ? (
                    <IconCheck className="h-6 w-6" />
                  ) : contract.tone === "wait" ? (
                    <IconHourglass className="h-6 w-6" />
                  ) : (
                    <IconPen className="h-6 w-6" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-muted">Votre contrat</p>
                  <h2 className="mt-0.5 text-xl font-bold text-foreground">{contract.title}</h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted">{contract.desc}</p>
                </div>
              </div>
              <Link
                href="/espace-client/signature"
                className={`shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  contract.tone === "todo"
                    ? "bg-primary text-white hover:bg-primary-dark"
                    : "border border-border text-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {contract.cta} →
              </Link>
            </div>
            {/* Les trois étapes de la signature, d'un coup d'œil. */}
            <ol className="mt-6 flex items-center gap-2" aria-label="Étapes de la signature">
              {PORTAL_STAGES.map((st, i) => (
                <li key={st.key} className="flex flex-1 items-center gap-2">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      stages.done[st.key] ? "bg-success text-white" : "border-2 border-primary text-primary"
                    }`}
                    aria-hidden
                  >
                    {stages.done[st.key] ? <IconCheck className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className={`text-sm ${stages.done[st.key] ? "text-success-text" : "font-semibold text-foreground"}`}>
                    {st.label}
                  </span>
                  {i < PORTAL_STAGES.length - 1 && (
                    <span className={`h-0.5 flex-1 rounded-full ${stages.done[st.key] ? "bg-success" : "bg-border"}`} aria-hidden />
                  )}
                </li>
              ))}
            </ol>
          </section>

          {/* ── Au quotidien : accès, documents, factures ─────────────────── */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                key: "acces",
                Icon: IconKey,
                title: "Mes accès TIM",
                text:
                  credentialCount > 0
                    ? `${credentialCount} accès prêts, à imprimer et à remettre à vos équipes.`
                    : "Nous préparons les identifiants de vos utilisateurs.",
                href: credentialCount > 0 ? "/espace-client/acces" : null,
                cta: "Voir mes accès",
              },
              {
                key: "documents",
                Icon: IconFile,
                title: "Mes documents",
                text: client.signatureDate
                  ? "Votre devis et votre contrat signés, à consulter et télécharger."
                  : "Votre devis et votre contrat, à relire et signer en ligne.",
                href: "/espace-client/signature",
                cta: "Voir mes documents",
              },
              {
                key: "factures",
                Icon: IconReceipt,
                title: "Mes factures",
                text: "Vos factures échues apparaîtront ici chaque mois, dès le démarrage de votre abonnement.",
                href: null,
                cta: "",
              },
            ].map((c) => {
              const body = (
                <>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface text-muted" aria-hidden>
                    <c.Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 font-semibold text-foreground">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted">{c.text}</p>
                  {c.href ? <span className="mt-auto pt-3 text-sm font-semibold text-primary">{c.cta} →</span> : null}
                </>
              );
              return c.href ? (
                <Link
                  key={c.key}
                  href={c.href}
                  className="flex flex-col rounded-lg border border-border bg-white p-5 transition hover:border-primary hover:shadow-sm"
                >
                  {body}
                </Link>
              ) : (
                <div key={c.key} className="flex flex-col rounded-lg border border-dashed border-border bg-white p-5">
                  {body}
                </div>
              );
            })}
          </div>

          {/* ── La phase de test, terminée : repliée, à rouvrir au besoin ──── */}
          {run && (
            <details className="group mt-8 rounded-lg border border-border bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <span className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-bg text-success-text" aria-hidden>
                    <IconCheck className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-semibold text-foreground">Votre phase de test</span>
                  <span className="text-sm text-muted">
                    {testSummary}
                  </span>
                </span>
                <span className="text-sm font-semibold text-muted group-open:hidden">Afficher</span>
                <span className="hidden text-sm font-semibold text-muted group-open:inline">Masquer</span>
              </summary>
              <div className="border-t border-border p-5">{testView}</div>
            </details>
          )}
        </>
      ) : (
        testView
      )}

      {/* ─── Pour aller plus loin ────────────────────────────────────────────
          Affichée SEULEMENT une fois les accès disponibles, et c'est tout le
          propos : ces trois liens parlent de se servir de TIM. Tant que le
          client n'a pas ses identifiants, « Suivre un parcours » l'envoie
          apprendre des gestes qu'il ne peut pas encore faire, et « Demander de
          l'assistance » lui propose de l'aide sur un logiciel où il n'est pas
          entré. Avant, ce qui compte est ce qu'on attend de LUI — son créneau,
          son dossier ; après, c'est de commencer à s'en servir.

          Icônes en trait plutôt que les emojis de la page publique : l'espace
          client a été refait avec ce jeu d'icônes, et deux styles sur le même
          écran se voient tout de suite. */}
      {credentialCount > 0 && (
      <section className="mt-12 border-t border-border pt-8">
        <h2 className="text-lg font-semibold text-foreground">Pour aller plus loin</h2>
        <p className="mt-1 text-sm text-muted">
          {signing
            ? "Le centre d'aide vous accompagne au quotidien : parcours, documentation et assistance."
            : "Le centre d'aide reste ouvert pendant et après votre test."}
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: "/parcours",
              Icon: IconRoute,
              title: "Suivre un parcours",
              text: "Apprenez les bases étape par étape, selon votre profil utilisateur.",
              cta: "Démarrer",
            },
            {
              href: "/features",
              Icon: IconBook,
              title: "Parcourir la documentation",
              text: `${featureCount} fonctionnalité${featureCount > 1 ? "s" : ""} documentée${featureCount > 1 ? "s" : ""}, organisée${featureCount > 1 ? "s" : ""} par thème.`,
              cta: "Explorer",
            },
            {
              href: "/contact?type=assistance",
              Icon: IconChat,
              title: "Demander de l'assistance",
              text: "Une question ou un problème ? Décrivez-le et joignez vos captures d'écran.",
              cta: "Contacter le support",
            },
          ].map(({ href, Icon, title, text, cta }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-white p-6 transition hover:border-primary hover:shadow-sm"
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface text-muted transition group-hover:bg-primary-light group-hover:text-primary"
                aria-hidden
              >
                <Icon className="h-6 w-6" />
              </span>
              <div>
                <h3 className="font-semibold text-foreground transition-colors group-hover:text-primary">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
              <span className="mt-auto pt-2 text-sm font-semibold text-primary">{cta} →</span>
            </Link>
          ))}
        </div>
      </section>
      )}
    </div>
  );
}
