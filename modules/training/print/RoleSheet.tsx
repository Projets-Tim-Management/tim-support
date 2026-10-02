import { printableUrl, type MemoGesture, type ProgrammeModule } from "@/modules/training/lib/kit";
import { profileLabel } from "@/modules/training/lib/plan";
import { PROFILE_TO_PARCOURS } from "@/modules/training/lib/training";
import type { ProfilKey } from "@/modules/partner/lib/pricing";

/**
 * Une FICHE DE RÔLE, remise à chaque personne formée — une page A4, dans
 * l'esprit des parcours du site support (même pastille de profil, mêmes
 * couleurs, même logo) : quand il est formé, son parcours, ses premières
 * fonctionnalités et comment démarrer. Sans durée : la fiche dit quoi, pas
 * combien de temps.
 *
 * Partagée par le kit d'une journée et par l'impression « Fiches par rôle ».
 * Composant sans état, rendu côté serveur dans une page d'impression.
 *
 * `print-color-adjust: exact` : sans lui, Chrome n'imprime pas les fonds
 * (réglage par défaut) — pastilles et encadrés sortaient blancs.
 */

const frDay = (iso: string) => {
  const s = new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const frHour = (hhmm?: string | null) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":");
  return `${Number(h)} h${m && m !== "00" ? ` ${m}` : ""}`;
};

/**
 * Le visage de chaque profil, repris de la page « Parcours » du site support
 * (icône, accroche, couleur) — le chef d'équipe partage celui du chef de
 * chantier, comme son parcours. Classes complètes : Tailwind doit les voir.
 */
const LOOK: Record<string, { icon: string; tagline: string; accent: string; ring: string }> = {
  admin: { icon: "👔", tagline: "Gestion globale du compte et des accès", accent: "bg-primary-light", ring: "border-primary" },
  conducteur: { icon: "📋", tagline: "Suivi des chantiers et de l'activité", accent: "bg-absence-bg", ring: "border-absence" },
  chefChantier: { icon: "🦺", tagline: "Pilotage opérationnel sur le terrain", accent: "bg-processing-bg", ring: "border-processing" },
  chefEquipe: { icon: "🦺", tagline: "Organisation de l'équipe sur le terrain", accent: "bg-processing-bg", ring: "border-processing" },
  compagnon: { icon: "🛠️", tagline: "Pointage et consultation au quotidien", accent: "bg-success-bg", ring: "border-success" },
};

export type RoleSlot = { date?: string | null; start?: string | null; end?: string | null; title: string };

export function RoleSheet({
  profile,
  companyName,
  modules,
  slots,
  gestures,
  site,
}: {
  profile: string;
  companyName: string;
  modules: ProgrammeModule[];
  slots: RoleSlot[];
  gestures: MemoGesture[];
  site: string;
}) {
  const look = LOOK[profile] ?? LOOK.compagnon;
  const guides = `${site}/parcours?profil=${PROFILE_TO_PARCOURS[profile as ProfilKey] ?? ""}`;

  return (
    <div className="break-before-page pt-10 text-foreground [print-color-adjust:exact] print:pt-0">
      {/* En-tête : logo du support, et pour qui */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- page d'impression : l'image doit être là au moment de l'aperçu */}
        <img src="/logo-support.webp" alt="TIM support" className="h-9 w-auto" />
        <div className="text-right">
          <p className="text-[8pt] font-bold tracking-wider text-muted uppercase">Formation TIM</p>
          {companyName && <p className="text-sm font-semibold">{companyName}</p>}
        </div>
      </div>

      {/* Le profil, comme sur la page « Parcours » du site */}
      <div className="mt-4 flex items-center gap-4">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-3xl ${look.accent}`}>
          <span aria-hidden>{look.icon}</span>
        </div>
        <div>
          <p className="text-[8pt] font-bold tracking-wider text-primary uppercase">Votre formation</p>
          <h1 className="text-2xl leading-tight font-bold">{profileLabel(profile)}</h1>
          <p className="text-sm text-muted">{look.tagline}</p>
        </div>
      </div>

      {/* Quand */}
      {slots.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {slots.map((s, i) => (
            <div key={i} className={`rounded-lg border-l-4 ${look.ring} ${look.accent} px-3 py-2`}>
              <p className="text-sm font-bold">{s.date ? frDay(s.date) : "Date à fixer"}</p>
              <p className="text-xs">
                {s.start ? `${frHour(s.start)}${s.end ? ` – ${frHour(s.end)}` : ""} · ` : ""}
                {s.title}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Le parcours */}
      {modules.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-1.5 text-base font-bold">Votre parcours</h2>
          <ol className="flex flex-col gap-1.5">
            {modules.map((m, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-border px-3 py-1">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[9pt] font-bold text-white">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-medium">{m.title}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Premières fonctionnalités */}
      {gestures.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-1.5 text-base font-bold">Vos premières fonctionnalités</h2>
          <div className="grid grid-cols-2 gap-2">
            {gestures.map((g) => (
              <div key={g.url} className="break-inside-avoid rounded-lg border border-border px-2.5 py-2">
                <p className="text-sm leading-tight font-semibold">{g.title}</p>
                {g.description && <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{g.description}</p>}
                <p className="mt-1 font-mono text-[7pt] text-primary">{printableUrl(g.url)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bien démarrer */}
      <section className="mt-4">
        <div>
          <h2 className="mb-1.5 text-base font-bold">Bien démarrer</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: "📲", title: "Installez l'application", text: "« TIM » sur l'App Store ou Google Play." },
              { icon: "🔑", title: "Connectez-vous", text: "Avec l'identifiant et le mot de passe de votre étiquette." },
              { icon: "❓", title: "Mot de passe oublié\u00a0?", text: "Lien « Mot de passe oublié » sur l'écran de connexion." },
            ].map((s) => (
              <div key={s.title} className="rounded-lg bg-primary-light px-2.5 py-2">
                <p className="text-lg leading-none" aria-hidden>
                  {s.icon}
                </p>
                <p className="mt-1 text-xs font-bold">{s.title}</p>
                <p className="mt-0.5 text-[8pt] leading-snug">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="mt-4 border-t border-border pt-2 text-xs text-muted">
        Tous les guides pas à pas de votre profil : <span className="font-mono text-primary">{printableUrl(guides)}</span> · Une question :
        répondez à l&apos;e-mail de convocation.
      </p>
    </div>
  );
}
