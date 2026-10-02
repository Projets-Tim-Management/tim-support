import { PROFILS, profileRank } from "@/modules/partner/lib/pricing";
import { profileLabel } from "@/modules/training/lib/plan";
import type { PrintPerson } from "@/modules/training/lib/print-data";

/**
 * Le tableau des identifiants, groupé par profil : nom, identifiant, mot de
 * passe, et une case « Remis » à cocher au stylo. Une ligne par personne —
 * une vingtaine tiennent sur une feuille A4.
 *
 * Partagé par la feuille « Identifiants » de la formation et par le kit d'une
 * journée. Les mots de passe ne sont présents que si la page les a lus (TIM).
 */
const fullName = (p: PrintPerson) => [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "—";

export function CredentialsTable({ people }: { people: PrintPerson[] }) {
  const sorted = [...people].sort((a, b) => profileRank(a.profile) - profileRank(b.profile) || fullName(a).localeCompare(fullName(b)));
  const groups = [...PROFILS.map((p) => p.key as string), ""]
    .map((key) => ({ key, people: sorted.filter((p) => (p.profile ?? "") === key) }))
    .filter((g) => g.people.length);
  if (!sorted.length) return <p className="text-muted">Aucun participant.</p>;
  return (
    <table className="w-full border-collapse text-[10pt]">
      <thead>
        <tr className="border-b-2 border-foreground text-left">
          <th className="py-1.5 pr-3">Nom</th>
          <th className="py-1.5 pr-3">Identifiant</th>
          <th className="py-1.5 pr-3">Mot de passe</th>
          <th className="w-14 py-1.5 text-center">Remis</th>
        </tr>
      </thead>
      {groups.map((g) => (
        <tbody key={g.key || "sans-profil"} className="break-inside-avoid">
          <tr>
            <td colSpan={4} className="pt-3 pb-1 text-[8pt] font-semibold tracking-wide text-muted uppercase">
              {g.key ? profileLabel(g.key) : "Sans profil de licence"} · {g.people.length}
            </td>
          </tr>
          {g.people.map((p) => (
            <tr key={p.id} className="border-b border-border">
              <td className="py-1.5 pr-3 font-semibold">{fullName(p)}</td>
              <td className="py-1.5 pr-3 font-mono text-[9pt]">{p.email || "— pas d'adresse"}</td>
              <td className="py-1.5 pr-3 font-mono font-bold">{p.password || "— à générer"}</td>
              <td className="py-1.5 text-center">
                <span className="inline-block h-4 w-4 border border-foreground align-middle" aria-hidden="true" />
              </td>
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
