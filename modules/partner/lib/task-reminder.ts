/**
 * E-mail de rappel d'une tâche de l'historique client.
 *
 * Pur (aucun accès base, aucun envoi) : la fabrication du message se teste, et
 * l'aperçu comme l'envoi passent par la même fonction.
 *
 * Ce que le message doit permettre : savoir QUOI faire et POUR QUI sans ouvrir
 * le back-office — puis y aller d'un clic si on décide d'agir.
 */

import { adminUrl } from "@/core/lib/email-template";

export type BuiltEmail = { subject: string; text: string; html: string };

type Task = {
  id: number | string;
  title?: string | null;
  content?: string | null;
  dueDate?: string | null;
  highPriority?: boolean;
  client?: { id?: number | string; companyName?: string } | number | string | null;
};


const frDateTime = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildTaskReminderEmail(task: Task): BuiltEmail {
  const client = typeof task.client === "object" && task.client ? task.client : null;
  const company = client?.companyName ?? null;
  const name = task.title?.trim() || "Tâche à faire";
  const due = frDateTime(task.dueDate);
  const link = client?.id ? adminUrl(`/collections/partner-clients/${client.id}`) : null;

  const subject = `${task.highPriority ? "⚑ " : ""}Rappel : ${name}${company ? ` — ${company}` : ""}`;

  const lines = [
    name,
    company ? `Opportunité : ${company}` : null,
    due ? `Échéance : ${due}` : null,
    task.content?.trim() ? `\n${task.content.trim()}` : null,
    link ? `\nOuvrir la fiche : ${link}` : null,
  ].filter(Boolean) as string[];

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#333">
  <p style="font-size:17px;font-weight:700;margin:0 0 12px">${task.highPriority ? "⚑ " : ""}${escape(name)}</p>
  ${company ? `<p style="margin:0 0 4px"><strong>Opportunité :</strong> ${escape(company)}</p>` : ""}
  ${due ? `<p style="margin:0 0 4px"><strong>Échéance :</strong> ${escape(due)}</p>` : ""}
  ${task.content?.trim() ? `<p style="margin:12px 0;white-space:pre-wrap">${escape(task.content.trim())}</p>` : ""}
  ${link ? `<p style="margin:18px 0 0"><a href="${link}" style="background:#fe5464;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700">Ouvrir la fiche</a></p>` : ""}
</div>`;

  return { subject, text: lines.join("\n"), html };
}
