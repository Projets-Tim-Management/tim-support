import type { Milestone } from "@/modules/marketing/lib/portal-timeline";

/**
 * Frise de la phase de test, avec ses jalons.
 *
 * Les dates ne sont plus écrites en toutes lettres au-dessus de la barre : elles
 * sont POSÉES dessus, chacune à sa place, et s'expliquent au survol. Trois lignes
 * de texte disaient « démarrage » et « fin » sans jamais dire ce qui se passe
 * entre les deux — la barre, elle, le montre.
 *
 * Aucun JavaScript : l'infobulle est un `group-hover`, et le point reste
 * atteignable au clavier (`tabIndex`, `group-focus-within`). Un composant client
 * pour afficher du texte au survol serait du poids pour rien.
 */

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

/** Jour en toutes lettres, sans heure : les jalons sont datés au JOUR, et
 *  l'heure affichée n'était qu'un artefact de la conversion UTC → Paris
 *  (minuit UTC devenait « 02:00 »). */
const fmtFullDay = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export default function TestTimeline({
  milestones,
  cursorPct,
  started,
}: {
  milestones: Milestone[];
  cursorPct: number;
  started: boolean;
}) {
  if (milestones.length === 0) return null;

  // Position du dernier jalon acquis : c'est jusque-là que la barre est pleine.
  const done = milestones.reduce((max, m) => (m.done ? Math.max(max, m.pct) : max), 0);

  return (
    <div className="pb-9 pt-8">
      <div className="relative h-1.5 rounded-full bg-border">
        {/* Le rempli va jusqu'au dernier jalon ACQUIS, pas jusqu'à aujourd'hui.
            Mesurer le temps donnait une barre qui n'avançait pas quand le client
            venait de tout remplir — ce qu'il regarde, c'est son avancement. */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]"
          style={{ width: `${done}%` }}
        />

        {milestones.map((m) => (
          <div
            key={m.key}
            className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${m.pct}%` }}
          >
            <span
              tabIndex={0}
              role="button"
              aria-label={`${m.label} — ${fmtDay(m.date)}`}
              // Trois états, trois couleurs : acquis, en retard, à venir. Un
              // jalon dont la date est passée SANS avoir été fait n'est pas
              // « fait » — le peindre comme les autres masquait le seul cas qui
              // demande une action.
              className={`relative block h-3.5 w-3.5 cursor-help rounded-full border-2 border-white outline-none ring-offset-1 focus-visible:ring-2 focus-visible:ring-primary ${
                m.done ? "bg-primary" : m.late ? "bg-processing" : m.next ? "bg-primary" : "bg-border"
              }`}
            >
              {/* Le prochain jalon pulse — un seul à la fois, sinon plus rien ne
                  ressort. Les autres sont des points fixes. */}
              {m.next && (
                <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" aria-hidden />
              )}
            </span>

            {/* Infobulle : au-dessus du point, invisible tant qu'on ne le vise
                pas. `pointer-events-none` pour qu'elle ne vole jamais le survol
                au point lui-même.
                
                Elle GLISSE selon la position du jalon : centrée au milieu de la
                frise, alignée à gauche sur le premier point, à droite sur le
                dernier. Une infobulle systématiquement centrée sortait de
                l'écran aux deux extrémités — et c'est justement là que se
                trouvent les jalons qu'on regarde le plus, le prochain et la fin. */}
            <span
              style={{ transform: `translateX(-${m.pct}%)` }}
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 w-56 rounded-md bg-foreground px-3 py-2 text-left text-xs leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:w-64">
              <span className="block font-semibold">{m.label}</span>
              <span className="block text-white/70">{fmtFullDay(m.date)}</span>
              <span className="mt-1 block text-white/90">{m.hint}</span>
            </span>

            {/* Sous le point : le libellé du prochain jalon seulement. Les six
                affichés d'un coup se chevaucheraient et rendraient la frise
                illisible — c'est précisément ce que l'infobulle évite. */}
            {m.next && (
              // Même glissement que l'infobulle : centré sur un point collé au
              // bord, le libellé sortait de l'écran — et c'est le seul qu'on
              // affiche, donc le seul qu'on ne peut pas se permettre de perdre.
              <span
                style={{ transform: `translateX(-${m.pct}%)` }}
                className="absolute left-1/2 top-full mt-2 w-max max-w-[9rem] text-xs font-semibold text-foreground"
              >
                {m.label}
                <span className="block font-normal text-muted">{fmtDay(m.date)}</span>
              </span>
            )}
          </div>
        ))}

        {/* Aujourd'hui : un trait, pas un point — pour ne pas se confondre avec
            les jalons. Masqué avant le démarrage, où il tomberait sur le premier. */}
        {started && (
          <span
            className="absolute -top-1.5 h-4.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: `${cursorPct}%` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
