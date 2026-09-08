/**
 * Échéance d'une tâche, dite en clair : « dans 12 min », « en retard de 2 jours ».
 *
 * Pur et testé à part parce que c'est un calcul, pas un affichage : il se lisait
 * dans un composant, et l'erreur qu'il contenait ne pouvait s'y voir qu'à l'œil,
 * au bon moment de la journée.
 *
 * CE QU'IL DISAIT DE FAUX. Tout ce qui était à moins d'une heure était arrondi
 * à « dans 1 h » — une réunion à 11 h annoncée « dans 1 h » alors qu'il est
 * 10 h 55, et « en retard de 1 h » une seconde après l'heure. On y lisait un
 * décalage de fuseau ; c'était un arrondi qui gonflait les minutes en heures.
 * Une échéance sert justement à savoir s'il reste dix minutes ou une heure.
 */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type RelativeDue = { text: string; late: boolean };

export function relativeDue(iso?: string | null, now: number = Date.now()): RelativeDue | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return null;

  const late = ms < 0;
  const abs = Math.abs(ms);

  // À la minute près, « dans 1 min » et « en retard de 1 min » sont deux façons
  // compliquées de dire la même chose.
  if (abs < MINUTE) return { text: "maintenant", late };

  const unit =
    abs < HOUR
      ? `${Math.floor(abs / MINUTE)} min`
      : abs < DAY
        ? `${Math.floor(abs / HOUR)} h`
        : `${Math.floor(abs / DAY)} jour${abs >= 2 * DAY ? "s" : ""}`;

  return { text: late ? `en retard de ${unit}` : `dans ${unit}`, late };
}
