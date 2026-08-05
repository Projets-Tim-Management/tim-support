import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { ticketReplyEmail } from "@/modules/support/lib/email";
import { attachmentsFromForm, uploadImages } from "@/core/lib/uploads";
import { ticketValues } from "@/modules/support/admin/ticket-meta";
import { getSenders, ticketMailHeaders } from "@/modules/support/lib/brevo";

// Réponse du support à un ticket, déclenchée depuis la vue admin du ticket.
// Ajoute le message (+ pièces jointes éventuelles) au fil, envoie l'e-mail au
// client (Reply-To ticket-<n>@ pour garder le fil, avec les fichiers en pièces
// jointes), et relance le ticket si besoin. Réservé aux admins connectés.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const payload = await payloadClient();

  // Auth : seul un utilisateur connecté à l'admin peut répondre (cookie Payload).
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const ticketId = String(form.get("ticketId") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!ticketId || body.length < 1) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  // ── Expéditeur choisi + copies ────────────────────────────────────────────
  // L'expéditeur est VALIDÉ contre les adresses vérifiées du compte Brevo : une
  // adresse inconnue ferait rejeter l'envoi par Brevo, donc on retombe sur
  // l'adresse du support plutôt que de perdre la réponse.
  const fromInput = String(form.get("from") ?? "").trim().toLowerCase();
  const senders = await getSenders();
  const sender = senders.find((s) => s.email.toLowerCase() === fromInput);
  const from = sender ? { from: `${sender.name} <${sender.email}>` } : {};

  // Copies : adresses séparées par virgule / point-virgule / espace.
  const cc = String(form.get("cc") ?? "")
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter((a) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a))
    .slice(0, 10);

  const ticket = (await payload
    .findByID({ collection: "tickets", id: ticketId, depth: 0 })
    .catch(() => null)) as
    | { id: number; number?: number; subject: string; email: string; name?: string; status?: string; messages?: { author: "client" | "support"; body: string; sentAt: string; cc?: string; attachments?: number[] }[] }
    | null;
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Upload des pièces jointes (images) → média + pièces jointes e-mail.
  const { ids: attachmentIds, attachments: emailAttachments } = await uploadImages(
    payload,
    attachmentsFromForm(form),
  );

  const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  messages.push({
    author: "support",
    body,
    sentAt: new Date().toISOString(),
    // Trace des destinataires en copie : sans elle, impossible de savoir plus
    // tard qui a reçu cette réponse en dehors du demandeur.
    ...(cc.length ? { cc: cc.join(", ") } : {}),
    ...(attachmentIds.length ? { attachments: attachmentIds as number[] } : {}),
  });

  // Statut : on applique celui choisi dans la vue (envoyé avec la réponse). À
  // défaut, filet de sécurité — répondre relance un ticket nouveau/pris en
  // compte/résolu en « En cours ».
  const statusInput = String(form.get("status") ?? "").trim();
  const nextStatus = ticketValues("status").includes(statusInput)
    ? statusInput
    : ["new", "acknowledged", "resolved"].includes(ticket.status ?? "")
      ? "in_progress"
      : undefined;

  await payload.update({
    collection: "tickets",
    id: ticket.id,
    // Le support vient de répondre → le ticket n'attend plus de réponse
    // (retire les badges « à traiter » et « réponse client »).
    data: { messages, needsAttention: false, unreadClientReply: false, ...(nextStatus ? { status: nextStatus as "new" | "acknowledged" | "in_progress" | "on_hold" | "resolved" } : {}) },
  });

  // E-mail au client (best-effort : le message est déjà enregistré).
  let emailSent = true;
  try {
    await payload.sendEmail({
      to: ticket.email,
      ...from,
      ...(cc.length ? { cc } : {}),
      ...(process.env.REPLY_DOMAIN
        ? { replyTo: `ticket-${ticket.number}@${process.env.REPLY_DOMAIN}` }
        : {}),
      // Tag Brevo → l'onglet « E-mails » du ticket retrouve cet envoi.
      ...ticketMailHeaders(ticket.number as number),
      ...(emailAttachments.length ? { attachments: emailAttachments } : {}),
      ...ticketReplyEmail({
        name: ticket.name,
        email: ticket.email,
        subject: ticket.subject,
        number: ticket.number ?? 0,
        body,
      }),
    });
  } catch (e) {
    console.warn("[tickets/reply] e-mail échoué:", e);
    emailSent = false;
  }

  return NextResponse.json({ ok: true, emailSent, attachments: attachmentIds.length });
}
