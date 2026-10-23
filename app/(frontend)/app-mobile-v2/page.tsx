import type { Metadata } from "next";

import CountUp from "@/components/app-v2/CountUp";
import Phone from "@/components/app-v2/Phone";
import ProfileShowcase from "@/components/app-v2/ProfileShowcase";
import Reveal from "@/components/app-v2/Reveal";
import V2Booking from "@/components/app-v2/V2Booking";
import V2Message from "@/components/app-v2/V2Message";
import V2Video from "@/components/app-v2/V2Video";
import { APP_V2_PROFILES, APP_V2_VIDEO } from "@/modules/marketing/lib/app-v2";

import "./v2.css";

/**
 * Présentation de la V2 de l'application mobile — lien envoyé aux clients.
 *
 * Une page de lancement, pas une page d'aide : elle doit donner envie avant
 * d'informer. D'où les halos de l'ouverture, les téléphones qui
 * flottent, les chiffres en grand. L'ordre suit les questions qu'on se pose :
 * à quoi ça ressemble (le film), qu'est-ce qui change pour mes équipes (un
 * profil à la fois, à sa couleur de la vidéo), comment la voir avant tout le
 * monde (le rendez-vous), et à qui écrire (le support).
 *
 * Hors navigation du centre d'aide (voir ConditionalHeader). Non indexée :
 * c'est un envoi, pas une page du site.
 */

export const metadata: Metadata = {
  title: "L'application mobile V2",
  description:
    "Découvrez la V2 de l'application mobile Tim Management, ce qui change pour chaque profil, et réservez un tour de l'app avant sa mise en production.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "L'application mobile Tim Management passe en V2",
    description: "Le film, ce qui change pour chaque profil, et 20 minutes pour en faire le tour avec nous.",
    images: [{ url: APP_V2_VIDEO.poster.url, width: APP_V2_VIDEO.poster.largeur, height: APP_V2_VIDEO.poster.hauteur }],
  },
};

const [VISUEL, COMPAGNON, ENCADREMENT] = APP_V2_PROFILES;

/**
 * Les chiffres qui résument la V2 — tous tirés de la liste des changements.
 * Chacun prend la couleur du profil qu'il concerne dans le film (bleu pour le
 * Compagnon, jaune pour le Compagnon visuel), et le rouge de l'app pour les
 * congés, nouveauté commune à tous.
 */
const STATS = [
  {
    value: 1,
    unit: "clic",
    label: "pour lancer le chrono quand un seul chantier est prévu",
    tone: { icon: "bg-absence-bg text-absence", unit: "text-absence", glow: "bg-absence" },
    icon: (
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M10 2h4M12 2v3" />
      </>
    ),
  },
  {
    value: 2,
    unit: "clics",
    label: "pour ajouter une photo ou un document de chantier",
    tone: { icon: "bg-success-bg text-success-text", unit: "text-success-text", glow: "bg-success" },
    icon: (
      <>
        <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
        <circle cx="12" cy="13.5" r="3.5" />
      </>
    ),
  },
  {
    value: 1,
    unit: "profil",
    label: "en plus : le Compagnon visuel, pour consulter sans pointer",
    tone: { icon: "bg-processing-bg text-processing-text", unit: "text-processing-text", glow: "bg-processing" },
    icon: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
      </>
    ),
  },
  {
    value: 0,
    unit: "papier",
    label: "pour les demandes de congé, posées et suivies dans l'app",
    tone: { icon: "bg-primary-light text-primary", unit: "text-primary", glow: "bg-primary" },
    icon: (
      <>
        <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z" />
        <path d="M14 3v4h4M3 3l18 18" />
      </>
    ),
  },
];

const TITLE = ["L'app", "mobile."];

export default function AppMobileV2Page() {
  return (
    <div className="overflow-x-clip bg-white">
      {/* ── 1. Ouverture : noir, halos, titre, les trois profils ─────────── */}
      <section className="relative isolate overflow-hidden bg-gradient-to-b from-white via-white to-absence-bg/60 text-foreground">
        <div className="v2-aurora v2-aurora-light" aria-hidden="true">
          <div className="v2-blob left-[-10%] top-[-15%] h-[520px] w-[520px] bg-primary" />
          <div className="v2-blob right-[-12%] top-[10%] h-[480px] w-[480px] bg-unavailable" />
          <div className="v2-blob bottom-[-20%] left-[30%] h-[460px] w-[460px] bg-absence" />
        </div>
        <div className="v2-grid" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="pb-10 pt-16 text-center sm:pt-24">
            <h1 className="text-[clamp(3rem,11vw,8.5rem)] font-bold leading-[0.95] tracking-tight text-ink">
              {TITLE.map((w, i) => (
                <span key={w} className="v2-word mr-[0.22em]" style={{ "--d": `${150 + i * 120}ms` } as React.CSSProperties}>
                  {w}
                </span>
              ))}
              <br />
              <span className="v2-word v2-gradient-text" style={{ "--d": "450ms" } as React.CSSProperties}>
                Réinventée.
              </span>
            </h1>

            <p
              className="v2-in mx-auto mt-6 max-w-2xl text-lg text-foreground/70 sm:text-xl"
              style={{ "--d": "650ms" } as React.CSSProperties}
            >
              Un nouveau profil. Le pointage sur l&apos;accueil. Les congés dans la poche. La V2 est pensée pour chaque
              métier du chantier.
            </p>

            <div
              className="v2-in mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ "--d": "800ms" } as React.CSSProperties}
            >
              <a
                href="#rendez-vous"
                className="rounded-full bg-primary px-7 py-3.5 font-semibold text-white shadow-lg shadow-primary/40 transition hover:scale-[1.03] hover:bg-primary-dark"
              >
                Réserver mon tour de 20 min
              </a>
              <a
                href="#film"
                className="inline-flex items-center gap-2 rounded-full bg-white/70 px-6 py-3.5 font-semibold text-foreground ring-1 ring-border backdrop-blur transition hover:bg-white"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
                </svg>
                Voir le film
              </a>
            </div>
          </div>

          {/* Les trois profils, en éventail, avec les étiquettes de la vidéo. */}
          <div className="relative mx-auto flex max-w-4xl items-end justify-center gap-3 pb-0 sm:gap-8">
            {[
              { p: VISUEL, rot: "-rotate-6", size: "w-[30%] max-w-[230px]", d: 900, f: 0 },
              { p: COMPAGNON, rot: "", size: "w-[36%] max-w-[280px] -mb-6 z-10", d: 1000, f: 1200 },
              { p: ENCADREMENT, rot: "rotate-6", size: "w-[30%] max-w-[230px]", d: 1100, f: 2400 },
            ].map(({ p, rot, size, d, f }) =>
              p ? (
                <div key={p.id} className={`v2-rise ${size}`} style={{ "--d": `${d}ms` } as React.CSSProperties}>
                  {/* La rotation porte sur le BLOC : étiquettes et téléphone penchent ensemble. */}
                  <div className={`v2-float ${rot}`} style={{ "--d": `${f}ms` } as React.CSSProperties}>
                    <div className="mb-3 flex flex-wrap justify-center gap-1">
                      {p.roles.map((r) => (
                        <span
                          key={r.label}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold sm:px-2.5 sm:text-xs ${
                            r.tone === "processing"
                              ? "bg-processing-bg text-processing-text"
                              : r.tone === "absence"
                                ? "bg-absence-bg text-absence"
                                : r.tone === "success"
                                  ? "bg-success-bg text-success-text"
                                  : "bg-unavailable-bg text-unavailable"
                          }`}
                        >
                          {r.label}
                        </span>
                      ))}
                    </div>
                    <Phone screens={p.screens.slice(0, 1)} priority />
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </div>
        <div aria-hidden="true" className="h-24" />
      </section>

      {/* ── 2. Le film ─────────────────────────────────────────────────────── */}
      <section id="film" className="relative scroll-mt-4 bg-gradient-to-b from-absence-bg/60 to-white pb-24 pt-10 text-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Le film</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-ink sm:text-6xl">Quatre minutes pour tout voir.</h2>
          </Reveal>
          <div className="v2-zoom relative mt-12">
            <div aria-hidden="true" className="absolute inset-x-[10%] -bottom-10 top-10 rounded-full bg-absence/25 blur-3xl" />
            <div className="relative">
              <V2Video />
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Les chiffres ────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <Reveal>
            <h2 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Moins de gestes.
              <br />
              <span>Plus de chantier.</span>
            </h2>
          </Reveal>
          <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 110} className="h-full">
                <div className="group relative h-full overflow-hidden rounded-3xl bg-white p-6 shadow-sm ring-1 ring-border transition duration-300 hover:-translate-y-1.5 hover:shadow-xl sm:p-7">
                  {/* Halo à la couleur du profil, qui s'allume au survol. */}
                  <div
                    aria-hidden="true"
                    className={`absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-10 blur-2xl transition-opacity duration-500 group-hover:opacity-30 ${s.tone.glow}`}
                  />
                  <span className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${s.tone.icon}`}>
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {s.icon}
                    </svg>
                  </span>
                  <p className="relative mt-8 flex items-baseline gap-2">
                    <span className="text-6xl font-bold leading-none tracking-tight text-ink sm:text-7xl">
                      <CountUp to={s.value} />
                    </span>
                    <span className={`text-2xl font-bold ${s.tone.unit}`}>{s.unit}</span>
                  </p>
                  <p className="relative mt-4 text-[15px] leading-relaxed text-foreground/70">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. Profil par profil ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Profil par profil</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Un écran pensé pour chaque métier.
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-foreground/70">
              Mêmes couleurs que dans le film : choisissez un profil pour voir ce qui change pour lui.
            </p>
          </Reveal>
          <Reveal delay={150} className="mt-12">
            <ProfileShowcase profiles={APP_V2_PROFILES} />
          </Reveal>
        </div>
      </section>

      {/* ── 5. Les congés, la nouveauté partagée par tous ──────────────────── */}
      <section className="relative isolate overflow-hidden bg-gradient-to-br from-absence-bg/70 via-white to-primary-light text-foreground">
        <div className="v2-aurora v2-aurora-light" aria-hidden="true">
          <div className="v2-blob right-[-10%] top-[-20%] h-[460px] w-[460px] bg-primary" />
          <div className="v2-blob bottom-[-25%] left-[-10%] h-[420px] w-[420px] bg-unavailable" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 sm:py-32 md:grid-cols-[1fr_auto]">
          <div>
            <Reveal>
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">Nouveau</span>
              <h2 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
                Les congés.
                <br />
                <span className="v2-gradient-text">Enfin dans l&apos;app.</span>
              </h2>
              <p className="mt-5 max-w-xl text-lg text-foreground/70">
                Pour tous les profils : Compagnon visuel, Compagnon, Chef de chantier et Conducteur de travaux.
              </p>
            </Reveal>
            <ol className="mt-10 space-y-4">
              {[
                ["Choisir l'absence", "Absent, intempérie, repos compensateur…"],
                ["Indiquer la période", "Du premier au dernier jour, sur le calendrier."],
                ["Ajouter si besoin", "Un commentaire, une photo ou un justificatif."],
                ["Le bureau répond", "Validation ou refus, et la réponse arrive par e-mail."],
              ].map(([t, d], i) => (
                <Reveal key={t} delay={i * 120}>
                  <li className="flex items-start gap-4 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-border backdrop-blur">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block font-semibold">{t}</span>
                      <span className="block text-sm text-foreground/60">{d}</span>
                    </span>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal delay={200} className="mx-auto w-[240px] sm:w-[280px]">
            <div className="v2-float">
              <Phone screens={[{ src: "/app-v2/ecran-absence-3.jpg", alt: "Mes demandes d'absence : une demande en attente de validation", full: true }]} className="rotate-3" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 6. Le rendez-vous ──────────────────────────────────────────────── */}
      <section id="rendez-vous" className="relative isolate scroll-mt-4 overflow-hidden bg-white">
        <div aria-hidden="true" className="absolute left-1/2 top-0 -z-10 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6 sm:py-32">
          <Reveal className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-light px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <span className="v2-pulse h-2 w-2 rounded-full bg-primary" />
              Places limitées
            </span>
            <h2 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Voyez-la avant
              <br />
              tout le monde.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-foreground/70">
              20 minutes en visio avec Charlie Piancatelli : un tour de la V2 sur vos cas réels, et toutes vos questions,
              avant la mise en production.
            </p>
          </Reveal>
          <Reveal delay={150} className="mt-12">
            <V2Booking />
          </Reveal>
        </div>
      </section>

      {/* ── 7. Écrire au support ───────────────────────────────────────────── */}
      <section id="message" className="scroll-mt-4 bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight text-ink sm:text-5xl">Une question, une idée&nbsp;?</h2>
            <p className="mt-3 max-w-2xl text-lg text-foreground/70">
              Écrivez directement au support. Vos idées sur la V2 nous intéressent, surtout avant la mise en production.
            </p>
          </Reveal>
          <Reveal delay={120} className="mt-10">
            <V2Message />
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border bg-white text-muted">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-8 text-xs sm:px-6">
          <span>© Tim Management · L&apos;application mobile V2</span>
          <a href="#message" className="transition hover:text-foreground">
            Écrire au support
          </a>
        </div>
      </footer>
    </div>
  );
}
