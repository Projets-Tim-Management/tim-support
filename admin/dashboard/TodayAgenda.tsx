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
      : kind === "etape"
        ? // Une étape de parcours, à distinguer d'une tâche saisie à la main :
          // elle vient du déroulé de la phase de test, pas d'un rappel posé.
          { color: "var(--tim-purple)", bg: "var(--tim-purple-bg)" }
        : taskKindMeta(kind);
  return { color: m.color, background: m.bg };
};

/** « Programmé à 09:30 » — ou « Dans la journée » pour ce qui n'a pas d'heure. */
const horaire = (item: AgendaItem): string =>
  item.allDay ? "Dans la journée" : `Programmé à ${parisTime(item.at)}`;

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
function Etat({ item, onToggle, now }: { item: AgendaItem; onToggle?: (item: AgendaItem) => void; now: number }) {
  if (item.kind === "session") return null;

  /**
   * Une étape de parcours DATÉE ne se coche pas avant son jour : le serveur
   * la refuse (guardDatedSteps), inutile de proposer une case qui échouera.
   * Une tâche, elle, est un rappel — la faire en avance est permis.
   */
  const tropTot = Boolean(item.etape) && !item.done && parisDayKey(item.at) > parisDayKey(now);
  const libelle = tropTot
    ? "Se coche le jour dit, pas avant"
    : item.done
      ? "Faite — cliquer pour rouvrir"
      : "Marquer comme faite";
  const contenu = item.done ? Icons.checkCircle() : Icons.circle();
  const classe = `dash-agenda__state${item.done ? " dash-agenda__state--done" : ""}`;

  // Le clic EST le geste : il coche la tâche en base, il ne la prépare pas.
  if (!onToggle || tropTot) {
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
  now,
}: {
  item: AgendaItem;
  quand: string;
  etat: { texte: string; ton: "late" | "today" | "done" } | null;
  onToggle?: (item: AgendaItem) => void;
  now: number;
}) {
  const lignes = lignesAgenda(item);
  return (
    <li className={`dash-agenda__card${item.done ? " dash-agenda__card--done" : ""}`}>
      <div className="dash-agenda__top">
        <Etat item={item} onToggle={onToggle} now={now} />
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
            fiche de plus à ouvrir pour le retrouver. Session faite : plus rien
            à rejoindre. */}
        {item.link && !item.done && (
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
                now={now}
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
                quand={horaire(item)}
                etat={
                  item.done
                    ? { texte: "Faite", ton: "done" }
                    : item.kind === "session" && Date.parse(item.at) < now
                      ? // Créneau passé, étape pas encore acquise (elle le sera
                        // d'elle-même le lendemain) : on le dit, plutôt que de
                        // laisser croire à une session à venir.
                        { texte: "Passée — à valider", ton: "late" }
                      : jour === aujourdHui
                        ? { texte: "Aujourd'hui", ton: "today" }
                        : null
                }
                onToggle={onToggle}
                now={now}
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
