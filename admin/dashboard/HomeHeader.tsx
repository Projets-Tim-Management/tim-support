import type { AgendaData } from "./data-agenda";
import NewMenu from "./NewMenu";

/**
 * L'en-tête : qui, quel jour, et la journée en une phrase.
 *
 * « Bonjour Charlie · mercredi 16 septembre » puis « 4 actions aujourd'hui,
 * 2 en retard » : c'est le résumé qu'on lirait à voix haute en arrivant. Le
 * détail est juste dessous ; la phrase dit s'il faut s'y arrêter.
 */

const salutation = (nowMs: number): string => {
  // `formatToParts` : « 09 h » en français ne se parse pas en nombre.
  const heure = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(nowMs))
      .find((p) => p.type === "hour")?.value ?? "12",
  );
  return heure < 18 ? "Bonjour" : "Bonsoir";
};

const dateLongue = (nowMs: number): string =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(nowMs));

/** La phrase du jour, ou « Rien ne presse. » quand c'est le cas. */
const resume = (agenda: AgendaData, jour: string): string => {
  const aujourdHui = agenda.items.filter(
    (i) =>
      !i.done &&
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(new Date(i.at)) === jour,
  ).length;
  const retard = agenda.retard.filter((i) => !i.done).length;
  const parts = [
    aujourdHui ? `${aujourdHui} action${aujourdHui > 1 ? "s" : ""} aujourd'hui` : null,
    retard ? `${retard} en retard` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}.` : "Rien ne presse — bonne journée.";
};

export default function HomeHeader({
  prenom,
  now,
  agenda,
  adminRoute,
  admin,
}: {
  prenom: string | null;
  now: number;
  agenda: AgendaData;
  adminRoute: string;
  admin: boolean;
}) {
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(new Date(now));
  return (
    <header className="home-head">
      <div className="home-head__text">
        <p className="home-head__date">{dateLongue(now)}</p>
        <h1 className="home-head__title">
          {salutation(now)}
          {prenom ? ` ${prenom}` : ""}
        </h1>
        <p className="home-head__summary">{resume(agenda, jour)}</p>
      </div>
      <NewMenu adminRoute={adminRoute} admin={admin} />
    </header>
  );
}
