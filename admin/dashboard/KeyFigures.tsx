import Link from "next/link";

import type { KeyFigure } from "./data-home";
import { Icons } from "./icons";

/**
 * Quatre chiffres, pas un de plus.
 *
 * Chacun est une PORTE : le CA mène à l'analyse de facturation, les tickets à
 * l'analyse support. Le tableau de bord ne refait pas les analyses, il dit où
 * on en est et où creuser.
 *
 * Une tuile = un pictogramme teinté (une couleur par chiffre, pour les
 * reconnaître sans lire), le libellé, la valeur en grand, une ligne de
 * contexte, et la flèche qui dit où l'on va.
 */
export default function KeyFigures({ figures }: { figures: KeyFigure[] }) {
  return (
    <section className="home-figures" aria-label="Chiffres clés">
      <header className="home-section__head">
        <h2 className="home-section__title">En chiffres</h2>
      </header>
      <ul className="home-figures__grid">
        {figures.map((f) => (
          <li key={f.key}>
            <Link href={f.href} className={`home-figure home-figure--${f.tone}`} title={f.cta}>
              <span className="home-figure__icon" aria-hidden>
                {Icons[f.icon]()}
              </span>
              <span className="home-figure__body">
                <span className="home-figure__label">{f.label}</span>
                <span className="home-figure__value">{f.value}</span>
                {f.sub && <span className="home-figure__sub">{f.sub}</span>}
              </span>
              <span className="home-figure__cta">
                {f.cta}
                <span className="home-figure__arrow" aria-hidden>
                  {Icons.arrowRight()}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
