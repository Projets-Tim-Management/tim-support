import { grilleDuMois, nomDuMois, parisDayKey } from "./agenda";

/**
 * Le mois, à côté de la journée.
 *
 * Il ne répète pas les rendez-vous : il montre OÙ ils tombent — un point sous
 * le jour occupé — et sert à changer de journée d'un clic. L'agenda voisin
 * répond à « qu'est-ce que j'ai maintenant ? », celui-ci à « et jeudi ? ».
 *
 * Six semaines toujours affichées : un calendrier qui change de hauteur d'un
 * mois à l'autre ne peut pas rester aligné sur le bloc voisin.
 */

const JOURS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];

export default function MonthCalendar({
  compteurs,
  now,
  selected,
  onSelect,
}: {
  compteurs: Map<string, { total: number; restants: number }>;
  /** Fournie par l'appelant : un composant ne lit pas l'horloge en rendant. */
  now: number;
  selected: string;
  onSelect: (jour: string) => void;
}) {
  const aujourdHui = parisDayKey(now);
  const semaines = grilleDuMois(aujourdHui, compteurs);

  return (
    <section className="dash-cal" aria-label={`Calendrier de ${nomDuMois(aujourdHui)}`}>
      <header className="dash-cal__head">
        <h2 className="dash-cal__title">{nomDuMois(aujourdHui)}</h2>
      </header>

      <div className="dash-cal__grid">
        {JOURS.map((j) => (
          <span key={j} className="dash-cal__dow" aria-hidden>
            {j}
          </span>
        ))}

        {semaines.flat().map((c) => {
          const titre =
            c.total === 0
              ? undefined
              : `${c.total} action${c.total > 1 ? "s" : ""}${
                  c.restants > 0 ? ` · ${c.restants} à faire` : " · toutes faites"
                }`;
          return (
            <button
              key={c.date}
              type="button"
              title={titre}
              aria-pressed={c.date === selected}
              onClick={() => onSelect(c.date)}
              className={[
                "dash-cal__day",
                !c.dansLeMois && "dash-cal__day--out",
                c.date === aujourdHui && "dash-cal__day--today",
                c.date === selected && "dash-cal__day--selected",
                c.total > 0 && c.restants === 0 && "dash-cal__day--clear",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="dash-cal__num">{c.numero}</span>
              {/* Un point SOUS le nombre, comme un agenda papier : il signale
                  sans empiéter sur le chiffre, donc la grille reste lisible en
                  entier. Vert quand tout ce qui était prévu est fait. */}
              {c.total > 0 && <span className="dash-cal__dot" aria-hidden />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
