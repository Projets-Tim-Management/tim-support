"use client";

import { useCallback, useMemo, useState } from "react";

import { agendaDuJour, compterParJour, parisDayKey, type AgendaItem } from "./agenda";
import MonthCalendar from "./MonthCalendar";
import TodayAgenda from "./TodayAgenda";

/**
 * L'en-tête du tableau de bord : le mois à gauche, la journée à côté.
 *
 * Le mois entier est chargé UNE fois par le serveur ; cliquer une date ne fait
 * donc aucun aller-retour, elle filtre ce qui est déjà là. C'est ce qui permet
 * de parcourir sa semaine en trois clics sans attendre un rechargement.
 *
 * Le RETARD ne suit pas la date choisie : « en retard » se dit par rapport à
 * aujourd'hui, pas par rapport au 15 du mois qu'on consulte. Il ne s'affiche
 * donc qu'avec la journée en cours.
 */

/** Identifiant de la tâche derrière une ligne d'agenda (`tache-42` → `42`). */
const idTache = (item: AgendaItem): string | null =>
  item.id.startsWith("tache-") ? item.id.slice("tache-".length) : null;

export default function AgendaBoard({
  items: initiaux,
  retard: retardInitial,
  now,
}: {
  items: AgendaItem[];
  retard: AgendaItem[];
  now: number;
}) {
  const aujourdHui = parisDayKey(now);
  const [jour, setJour] = useState(aujourdHui);
  const [items, setItems] = useState(initiaux);
  const [retard, setRetard] = useState(retardInitial);
  const [erreur, setErreur] = useState<string | null>(null);

  const duJour = useMemo(() => agendaDuJour(items, jour), [items, jour]);
  const compteurs = useMemo(() => compterParJour(items), [items]);

  /**
   * Cocher (ou décocher) une tâche depuis le tableau de bord.
   *
   * L'écran bascule TOUT DE SUITE, l'écriture suit : cocher est un geste qu'on
   * enchaîne sur trois lignes d'affilée, et attendre le serveur à chaque clic
   * rendrait la liste poisseuse. Si l'écriture échoue, on remet la ligne dans
   * son état — mieux vaut un retour en arrière visible qu'une tâche qu'on croit
   * faite et qui ne l'est pas.
   *
   * `doneAt` est posé par le serveur (hook stampDone) : on n'envoie que `done`.
   */
  const basculer = useCallback(async (item: AgendaItem) => {
    const id = idTache(item);
    if (!id) return; // une session ne se coche pas ici
    const vise = !item.done;

    /**
     * On MARQUE la ligne, on ne la retire d'aucune liste.
     *
     * Une tâche cochée disparaît des retards parce que l'affichage les filtre
     * sur `done`, pas parce qu'on l'a supprimée du tableau. C'est ce qui rend
     * le retour en arrière exact : il suffit de remettre le drapeau. Retirer
     * puis restaurer la liste entière ressuscitait les tâches cochées avec
     * succès juste avant celle qui échoue.
     */
    const marquer = (valeur: boolean) => {
      const poser = (liste: AgendaItem[]) =>
        liste.map((i) => (i.id === item.id ? { ...i, done: valeur } : i));
      setItems(poser);
      setRetard(poser);
    };

    marquer(vise);
    setErreur(null);
    try {
      const res = await fetch(`/payload-api/client-activities/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: vise }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      // Dire l'échec, et pas seulement défaire : une ligne qui revient toute
      // seule à son état passe pour un clic raté, et on recommence.
      marquer(!vise);
      setErreur(
        vise
          ? "La tâche n'a pas pu être marquée comme faite."
          : "La tâche n'a pas pu être rouverte.",
      );
    }
  }, []);

  return (
    <div className="dash-today">
      <MonthCalendar compteurs={compteurs} now={now} selected={jour} onSelect={setJour} />
      <TodayAgenda
        items={duJour}
        // Une tâche cochée quitte les retards : c'est le filtre qui l'y retire,
        // pas une suppression — le retour en arrière reste possible.
        retard={jour === aujourdHui ? retard.filter((i) => !i.done) : []}
        now={now}
        jour={jour}
        aujourdHui={aujourdHui}
        onToggle={basculer}
        erreur={erreur}
      />
    </div>
  );
}
