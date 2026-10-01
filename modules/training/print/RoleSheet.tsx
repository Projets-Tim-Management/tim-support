import { printableUrl, type MemoGesture, type ProgrammeModule } from "@/modules/training/lib/kit";
import { profileLabel } from "@/modules/training/lib/plan";

/**
 * Une FICHE DE RÔLE, à remettre à chaque personne formée : ce qui sera abordé
 * pour son profil, quand, ses premières fonctionnalités et comment démarrer.
 *
 * Partagée par le kit d'une journée et par l'impression « Fiches par rôle » :
 * une seule rédaction, pour que les deux documents disent la même chose.
 * Composant sans état, rendu côté serveur dans une page d'impression.
 */

const frDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
const frHour = (hhmm?: string | null) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":");
  return `${Number(h)} h${m && m !== "00" ? ` ${m}` : ""}`;
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
  const total = modules.reduce((n, m) => n + Math.max(5, Math.round(m.minutes ?? 10)), 0);
  let step = 1;
  return (
    <div className="break-before-page pt-10 text-foreground print:pt-0">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">
        {companyName ? `${companyName} · ` : ""}Formation TIM
      </p>
      <h1 className="mt-1 mb-6 text-2xl font-bold">{profileLabel(profile)} : votre formation</h1>

      {slots.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">Quand</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {slots.map((s, i) => (
              <li key={i}>
                <strong>{s.date ? frDay(s.date) : "Date à fixer"}</strong>
                {s.start ? `, ${frHour(s.start)}${s.end ? ` – ${frHour(s.end)}` : ""}` : ""} · {s.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {modules.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">
            Ce que nous allons voir <span className="text-sm font-normal text-muted">· environ {Math.round(total / 15) * 15 || total} min</span>
          </h2>
          <ol className="flex flex-col gap-1.5 text-sm">
            {modules.map((m, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-border pb-1.5">
                <span>
                  {i + 1}. {m.title}
                </span>
                <span className="text-xs text-muted">{Math.max(5, Math.round(m.minutes ?? 10))} min</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {gestures.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-base font-semibold">Vos premières fonctionnalités</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {gestures.map((g) => (
              <li key={g.url} className="flex justify-between gap-4 border-b border-border pb-1.5">
                <span>{g.title}</span>
                <span className="font-mono text-xs text-muted">{printableUrl(g.url)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold">Bien démarrer</h2>
        <ol className="flex flex-col gap-2 text-sm">
          <li>
            <strong>{step++}. Installez l&apos;application TIM</strong> sur votre téléphone : App Store ou Google Play, cherchez « TIM ».
          </li>
          <li>
            <strong>{step++}. Connectez-vous</strong> : votre identifiant est votre adresse e-mail, votre mot de passe vous est remis.
          </li>
          <li>
            <strong>{step++}. Mot de passe oublié ?</strong> Lien « Mot de passe oublié » sur l&apos;écran de connexion.
          </li>
          <li>
            <strong>{step++}. Pour aller plus loin</strong> : tous les guides pas à pas sur{" "}
            <span className="font-mono">{printableUrl(`${site}/parcours`)}</span>
          </li>
        </ol>
      </section>
    </div>
  );
}
