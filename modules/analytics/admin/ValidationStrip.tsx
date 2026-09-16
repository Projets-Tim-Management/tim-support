import Link from "next/link";

/**
 * Sous un graphique mensuel : pour chaque mois, combien de fiches ont leur
 * mois SIGNÉ sur le rapprochement — donc combien du CA affiché est vérifié.
 *
 * Un mois où rien n'est signé n'est qu'un ATTENDU (les fiches reportées) :
 * on le dit, plutôt que de laisser croire que le chiffre est acquis. Vert
 * quand tout est signé, ambre en cours, gris estimé. Le mois en cours et le
 * suivant sont ceux qu'on prépare ; le passé se fige.
 *
 * Server-safe : aucun état, du texte et des pastilles.
 */
export type ValidationMonth = { month: string; billed: number; validated: number };

const moisCourt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });

export function ValidationStrip({ months, href = "/admin/facturation?f=a-valider" }: { months: ValidationMonth[]; href?: string }) {
  const shown = months.filter((m) => m.billed > 0);
  if (shown.length === 0) return null;
  return (
    <ol className="an-valid" aria-label="Validation du rapprochement, mois par mois">
      {shown.map((m) => {
        const tone = m.validated >= m.billed ? "ok" : m.validated > 0 ? "part" : "none";
        const texte = m.validated >= m.billed ? "validé" : m.validated > 0 ? `${m.validated}/${m.billed} validés` : "estimé";
        return (
          <li key={m.month} className={`an-valid__month an-valid__month--${tone}`}>
            <span className="an-valid__label">{moisCourt(m.month)}</span>
            {tone === "ok" ? (
              <span className="an-valid__state">{texte}</span>
            ) : (
              <Link className="an-valid__state" href={href} prefetch={false} title="Ouvrir le rapprochement">
                {texte}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
