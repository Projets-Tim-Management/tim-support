import Link from "next/link";

import { taskKindMeta } from "@/modules/partner/lib/activity";

import { depuisQuand, lignesAgenda, parisDayKey, parisTime, type AgendaItem } from "./agenda";
import { Icons } from "./icons";

/**
 * Ce qui est prévu le jour choisi, en cartes.
 *
 * Une carte par action : ce qu'il y a à faire en titre, l'horaire à droite, et
 * dessous les étiquettes qui situent — nature, chez qui, état. Le regard balaie
 * la colonne des heures, puis s'arrête sur une carte.
 *
 * Ce qui traîne (daté d'avant aujourd'hui, jamais coché) passe AVANT : sans
 * cette liste, une tâche non faite disparaissait du tableau de bord à minuit et
 * l'écran redevenait calme alors que le travail, lui, restait.
 */

const MODE: Record<string, string> = { visio: "en visio", "sur-place": "sur place" };

const teinte = (kind: string): { color: string; background: string } => {
  const m =
    kind === "session"
      ? { color: "var(--tim-indigo)", bg: "var(--tim-indigo-bg)" }
      : taskKindMeta(kind);
  return { color: m.color, background: m.bg };
};

/** « aujourd'hui », « demain », ou la date en toutes lettres. */
const titreDuJour = (jour: string, aujourdHui: string): string => {
  if (jour === aujourdHui) return "Planifié pour aujourd'hui";
  const demain = new Date(Date.parse(`${aujourdHui}T00:00:00.000Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (jour === demain) return "Planifié pour demain";
  const libelle = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${jour}T00:00:00.000Z`));
  return `Planifié pour ${libelle}`;
};

/**
 * État d'une action : faite, ou pas encore.
 *
 * Une session n'a pas d'état ICI — elle a eu lieu ou non, et c'est l'étape
 * « Session de prise en main réalisée » du parcours qui le dit. On n'affiche
 * donc rien plutôt qu'un état qu'on ne saurait pas tenir.
 */
function Etat({ item, onToggle }: { item: AgendaItem; onToggle?: (item: AgendaItem) => void }) {
  if (item.kind === "session") return null;

  const libelle = item.done ? "Faite — cliquer pour rouvrir" : "Marquer comme faite";
  const contenu = item.done ? Icons.checkCircle() : Icons.circle();
  const classe = `dash-agenda__state${item.done ? " dash-agenda__state--done" : ""}`;

  // Le clic EST le geste : il coche la tâche en base, il ne la prépare pas.
  if (!onToggle) {
    return (
      <span className={classe} title={libelle} aria-label={libelle}>
        {contenu}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`${classe} dash-agenda__state--action`}
      title={libelle}
      aria-label={libelle}
      aria-pressed={Boolean(item.done)}
      onClick={() => onToggle(item)}
    >
      {contenu}
    </button>
  );
}

function Carte({
  item,
  quand,
  etat,
  onToggle,
}: {
  item: AgendaItem;
  quand: string;
  etat: { texte: string; ton: "late" | "today" | "done" } | null;
  onToggle?: (item: AgendaItem) => void;
}) {
  const lignes = lignesAgenda(item);
  return (
    <li className={`dash-agenda__card${item.done ? " dash-agenda__card--done" : ""}`}>
      <div className="dash-agenda__top">
        <Etat item={item} onToggle={onToggle} />
        <Link className="dash-agenda__what" href={item.href}>
          {lignes.principal}
        </Link>
        <span className="dash-agenda__when">{quand}</span>
      </div>

      <div className="dash-agenda__chips">
        <span className="dash-chip" style={teinte(item.kind)}>
          {item.label}
        </span>
        {lignes.secondaire && <span className="dash-chip dash-chip--who">{lignes.secondaire}</span>}
        {item.mode && !item.link && (
          <span className="dash-chip dash-chip--soft">{MODE[item.mode] ?? item.mode}</span>
        )}
        {etat && <span className={`dash-chip dash-chip--${etat.ton}`}>{etat.texte}</span>}
        {/* Le lien de visio EST le geste de 10 h : il mérite un bouton, pas une
            fiche de plus à ouvrir pour le retrouver. */}
        {item.link && (
          <a className="dash-chip dash-chip--join" href={item.link} target="_blank" rel="noreferrer">
            Rejoindre
          </a>
        )}
      </div>
    </li>
  );
}

export default function TodayAgenda({
  items,
  retard = [],
  now,
  jour,
  aujourdHui,
  onToggle,
  erreur,
}: {
  items: AgendaItem[];
  retard?: AgendaItem[];
  now: number;
  /** Jour affiché (`YYYY-MM-DD`). */
  jour: string;
  aujourdHui: string;
  /** Cocher une tâche d'ici. Absent → l'état reste un simple indicateur. */
  onToggle?: (item: AgendaItem) => void;
  /** Échec de la dernière écriture, en toutes lettres. */
  erreur?: string | null;
}) {
  const jourCourant = parisDayKey(now);

  return (
    <section className="dash-agenda" aria-label="Actions planifiées">
      <header className="dash-agenda__head">
        <h2 className="dash-agenda__title">{titreDuJour(jour, aujourdHui)}</h2>
        {/* Le compte annonce AUSSI le retard : « rien de prévu » au-dessus de
            deux cartes en retard se lisait comme une contradiction. */}
        <span className="dash-agenda__count">
          {retard.length > 0 && (
            <span className="dash-agenda__count-late">
              {retard.length} en retard{items.length > 0 ? " · " : ""}
            </span>
          )}
          {items.length > 0
            ? `${items.length} action${items.length > 1 ? "s" : ""}`
            : retard.length === 0 && "rien de prévu"}
        </span>
      </header>

      <div className="dash-agenda__body">
        {erreur && <p className="dash-agenda__erreur">{erreur}</p>}
        {retard.length > 0 && (
          <ul className="dash-agenda__list">
            {retard.map((item) => (
              <Carte
                key={item.id}
                item={item}
                quand={`Était prévu ${depuisQuand(item, jourCourant)}`}
                etat={{ texte: "En retard", ton: "late" }}
                onToggle={onToggle}
              />
            ))}
          </ul>
        )}

        {items.length > 0 ? (
          <ul className="dash-agenda__list">
            {items.map((item) => (
              <Carte
                key={item.id}
                item={item}
                quand={`Programmé à ${parisTime(item.at)}`}
                etat={
                  item.done
                    ? { texte: "Faite", ton: "done" }
                    : jour === aujourdHui
                      ? { texte: "Aujourd'hui", ton: "today" }
                      : null
                }
                onToggle={onToggle}
              />
            ))}
          </ul>
        ) : (
          retard.length === 0 && <p className="dash-agenda__empty">Rien de prévu ce jour-là.</p>
        )}
      </div>
    </section>
  );
}
