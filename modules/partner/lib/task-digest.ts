import { PARIS_TZ, dayKey } from "@/core/lib/dates";
import { BODY, BORDER, BRAND, FONT, INK, MUTED, OUTER, SITE_URL, escape } from "@/core/lib/email-template";
import { taskKindLabel } from "@/modules/partner/lib/activity";

/**
 * Récapitulatif matinal des rappels d'un partenaire : ce qui est en retard, ce
 * qui tombe aujourd'hui, ce qui vient cette semaine.
 *
 * Complément — et non doublon — du rappel à l'heure dite (task-reminders) : ce
 * dernier réveille sur UNE tâche au moment choisi, celui-ci donne la vue
 * d'ensemble avant de commencer la journée. Une tâche sans heure de rappel
 * n'apparaîtrait nulle part sans lui.
 *
 * Le regroupement et la fabrication du message sont PURS (aucune base, aucun
 * envoi) : c'est là que se décide ce qui compte comme « aujourd'hui », donc
 * c'est ce qu'il faut pouvoir tester.
 */

export type BuiltEmail = { subject: string; text: string; html: string };

export { dayKey };

export interface DigestTask {
  id: number | string;
  title?: string | null;
  taskKind?: string | null;
  dueDate?: string | null;
  highPriority?: boolean;
  client?: { id?: number | string; companyName?: string } | number | string | null;
}

export interface DigestGroups {
  late: DigestTask[];
  today: DigestTask[];
  /** Jours à venir (hors aujourd'hui), dans l'ordre, avec leurs tâches. */
  week: { dayKey: string; label: string; tasks: DigestTask[] }[];
  total: number;
}


const dayLabel = (d: Date | string): string =>
  new Date(d).toLocaleDateString("fr-FR", {
    timeZone: PARIS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const hour = (d?: string | null): string =>
  d
    ? new Date(d).toLocaleTimeString("fr-FR", {
        timeZone: PARIS_TZ,
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const plus = (from: Date, days: number): Date => new Date(from.getTime() + days * 86_400_000);

/** Libellé d'une tâche : son nom, à défaut sa nature. */
const label = (t: DigestTask): string => t.title?.trim() || taskKindLabel(t.taskKind) || "Tâche";

const clientName = (t: DigestTask): string | null =>
  typeof t.client === "object" && t.client ? (t.client.companyName ?? null) : null;

const byDue = (a: DigestTask, b: DigestTask) =>
  Date.parse(a.dueDate ?? "") - Date.parse(b.dueDate ?? "");

/**
 * Range les tâches ouvertes en retard / aujourd'hui / cette semaine.
 *
 * `days` = horizon de la semaine à venir (7 jours après aujourd'hui). Une tâche
 * plus lointaine n'a rien à faire dans un message du matin : elle serait lue
 * comme du bruit et ferait ignorer le reste.
 */
export function groupTasksForDigest(tasks: DigestTask[], now: Date, days = 7): DigestGroups {
  const todayKey = dayKey(now);
  const horizon = dayKey(plus(now, days));

  const late: DigestTask[] = [];
  const today: DigestTask[] = [];
  const later = new Map<string, DigestTask[]>();

  for (const t of tasks) {
    if (!t.dueDate) continue;
    const key = dayKey(t.dueDate);
    if (key < todayKey) late.push(t);
    else if (key === todayKey) today.push(t);
    else if (key <= horizon) later.set(key, [...(later.get(key) ?? []), t]);
  }

  const week = [...later.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({
      dayKey: key,
      label: dayLabel(list[0].dueDate!),
      tasks: list.sort(byDue),
    }));

  return {
    late: late.sort(byDue),
    today: today.sort(byDue),
    week,
    total: late.length + today.length + week.reduce((n, d) => n + d.tasks.length, 0),
  };
}

/** Au-delà, la liste des retards devient un mur : on compte le reste. */
const MAX_LATE = 10;

const line = (t: DigestTask, withHour = true): string => {
  const parts = [
    t.highPriority ? "⚑" : null,
    withHour ? hour(t.dueDate) : null,
    label(t),
    clientName(t) ? `— ${clientName(t)}` : null,
  ].filter(Boolean);
  return parts.join(" ");
};

const htmlLine = (t: DigestTask, color: string, withHour = true): string => {
  const url = `${SITE_URL}/admin/collections/partner-clients/${
    typeof t.client === "object" && t.client ? t.client.id : ""
  }`;
  const co = clientName(t);
  return `<tr>
    <td style="padding:5px 12px 5px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${color};white-space:nowrap;vertical-align:top;">${
      t.highPriority ? "⚑ " : ""
    }${withHour ? escape(hour(t.dueDate)) : "—"}</td>
    <td style="padding:5px 0;font-family:${FONT};font-size:14px;line-height:1.5;color:${INK};">
      <a href="${url}" style="color:${INK};text-decoration:none;font-weight:600;">${escape(label(t))}</a>
      ${co ? `<span style="color:${MUTED};"> — ${escape(co)}</span>` : ""}
    </td>
  </tr>`;
};

const section = (title: string, count: number, color: string, rows: string): string =>
  `<p style="margin:20px 0 6px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${color};">${title} (${count})</p>
   <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>`;

/**
 * Le message du matin.
 *
 * L'objet porte le chiffre qui décide si on ouvre : les retards d'abord (c'est
 * ce qui coûte), puis le nombre du jour. Un objet du type « Votre récapitulatif »
 * ne dit rien et finit par ne plus être ouvert.
 */
export function buildTaskDigestEmail(partnerName: string | null, g: DigestGroups): BuiltEmail {
  const url = `${SITE_URL}/admin/collections/client-activities?limit=50`;
  const weekCount = g.week.reduce((n, d) => n + d.tasks.length, 0);

  const subject = g.late.length
    ? `${g.late.length} rappel${g.late.length > 1 ? "s" : ""} en retard${
        g.today.length ? `, ${g.today.length} aujourd'hui` : ""
      }`
    : g.today.length
      ? `${g.today.length} rappel${g.today.length > 1 ? "s" : ""} aujourd'hui${
          weekCount ? ` — ${weekCount} cette semaine` : ""
        }`
      : `${weekCount} rappel${weekCount > 1 ? "s" : ""} cette semaine`;

  const lateShown = g.late.slice(0, MAX_LATE);
  const lateRest = g.late.length - lateShown.length;

  const text = [
    partnerName ? `Bonjour ${partnerName},` : "Bonjour,",
    "",
    g.late.length ? `EN RETARD (${g.late.length})` : null,
    ...lateShown.map((t) => `• ${line(t)}`),
    lateRest > 0 ? `• … et ${lateRest} autre${lateRest > 1 ? "s" : ""}` : null,
    g.late.length ? "" : null,
    g.today.length ? `AUJOURD'HUI (${g.today.length})` : "Rien à faire aujourd'hui.",
    ...g.today.map((t) => `• ${line(t)}`),
    "",
    weekCount ? "CETTE SEMAINE" : null,
    ...g.week.flatMap((d) => [`${d.label} :`, ...d.tasks.map((t) => `• ${line(t)}`)]),
    "",
    `Tout voir : ${url}`,
    "",
    "L'équipe support TIM",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:${OUTER};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
    <tr><td style="padding:22px 24px;">
      <p style="margin:0 0 4px;font-family:${FONT};font-size:18px;font-weight:800;color:${INK};">Vos rappels du jour</p>
      <p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.55;color:${BODY};">${
        partnerName ? `Bonjour ${escape(partnerName)}, v` : "V"
      }oici ce qui vous attend${g.late.length ? ", en commençant par les retards" : ""}.</p>
      ${
        g.late.length
          ? section(
              "En retard",
              g.late.length,
              BRAND,
              lateShown.map((t) => htmlLine(t, BRAND)).join("") +
                (lateRest > 0
                  ? `<tr><td colspan="2" style="padding:5px 0;font-family:${FONT};font-size:13px;color:${MUTED};">… et ${lateRest} autre${
                      lateRest > 1 ? "s" : ""
                    }.</td></tr>`
                  : ""),
            )
          : ""
      }
      ${
        g.today.length
          ? section("Aujourd'hui", g.today.length, INK, g.today.map((t) => htmlLine(t, INK)).join(""))
          : `<p style="margin:20px 0 6px;font-family:${FONT};font-size:14px;color:${MUTED};">Rien à faire aujourd'hui.</p>`
      }
      ${g.week
        .map((d) =>
          section(
            d.label,
            d.tasks.length,
            MUTED,
            d.tasks.map((t) => htmlLine(t, MUTED)).join(""),
          ),
        )
        .join("")}
      <a href="${url}" style="display:inline-block;margin-top:22px;padding:11px 22px;background:${BRAND};border-radius:8px;color:#ffffff;font-family:${FONT};font-size:14px;font-weight:700;text-decoration:none;">Ouvrir mes rappels</a>
      <p style="margin:18px 0 0;font-family:${FONT};font-size:15px;color:${BODY};">L'équipe support TIM</p>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
