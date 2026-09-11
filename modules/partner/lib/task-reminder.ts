/**
 * E-mail de rappel d'une tâche de l'historique client.
 *
 * Pur (aucun accès base, aucun envoi) : la fabrication du message se teste, et
 * l'aperçu comme l'envoi passent par la même fonction.
 *
 * Ce que le message doit permettre : savoir QUOI faire et POUR QUI sans ouvrir
 * le back-office — puis y aller d'un clic si on décide d'agir.
 */

import { adminUrl, teamNote, teamRows, teamShell } from "@/core/lib/email-template";

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

  // Charte ÉQUIPE (partenaire) : le nom de la tâche en titre, les faits en
  // fiche, la note telle qu'elle a été saisie, et le bouton vers la fiche.
  // Tout ce qui vient d'une saisie est échappé par les briques de la charte.
  const html = teamShell({
    audience: "partenaire",
    kicker: task.highPriority ? "Rappel · Priorité haute" : "Rappel",
    heading: name,
    preheader: [company, due].filter(Boolean).join(" · "),
    bodyHtml:
      teamRows([
        ...(company ? ([["Opportunité", company]] as [string, string][]) : []),
        ...(due ? ([["Échéance", due]] as [string, string][]) : []),
      ]) + (task.content?.trim() ? teamNote(task.content.trim(), "partenaire") : ""),
    cta: link ? { label: "Ouvrir la fiche", url: link } : undefined,
  });

  return { subject, text: lines.join("\n"), html };
}
