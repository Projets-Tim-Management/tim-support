import { after, NextResponse } from "next/server";

import {
  newTicketNoticeEmail,
  SUPPORT_NOTIFY_EMAIL,
  ticketConfirmationEmail,
} from "@/modules/support/lib/email";
import { payloadClient } from "@/core/payload-client";
import { attachmentsFromForm, uploadImages } from "@/core/lib/uploads";
import { ticketValues } from "@/modules/support/admin/ticket-meta";

const TICKET_TYPES = ticketValues("type");
const TICKET_SERVICES = ticketValues("service");

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

// Création d'un ticket de support (formulaire de contact) → Payload.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Requête invalide.", 400);
  }

  // Honeypot anti-spam : un bot remplit ce champ leurre → on fait comme si OK.
  if (String(form.get("website") ?? "").trim()) {
    return NextResponse.json({ success: true, ticket_number: 0 });
  }

  const subject = String(form.get("subject") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  const url = String(form.get("url") ?? "").trim();
  const typeRaw = String(form.get("type") ?? "assistance").trim();
  const serviceRaw = String(form.get("service") ?? "").trim();

  if (subject.length < 5 || subject.length > 200) return fail("Sujet invalide (5 à 200 caractères).");
  if (description.length < 10) return fail("Description trop courte (10 caractères minimum).");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Adresse e-mail invalide.");

  const type = TICKET_TYPES.includes(typeRaw) ? typeRaw : "assistance";
  const service = TICKET_SERVICES.includes(serviceRaw) ? serviceRaw : undefined;

  try {
    const payload = await payloadClient();

    // Pièces jointes (captures) — uniquement pour l'assistance.
    const attachments =
      type === "assistance" ? (await uploadImages(payload, attachmentsFromForm(form))).ids : [];

    // Le numéro (unique) est attribué automatiquement par le hook du champ
    // referenceNumber ; on le relit depuis le document créé.
    const created = await payload.create({
      collection: "tickets",
      data: {
        subject,
        description,
        email,
        name: name || undefined,
        url: url || undefined,
        service,
        type,
        status: "new",
        priority: "normal",
        needsAttention: true, // à traiter par le support (badge dashboard)
        attachments,
        ip: req.headers.get("x-forwarded-for") ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    });
    const number = created.number as number;

    // Confirmation au demandeur + notification admin. Exécutés APRÈS la réponse
    // via after() : ça ne ralentit pas le client, mais garantit que l'envoi va
    // jusqu'au bout (le fire-and-forget était abandonné aléatoirement quand le
    // serverless figeait la fonction après la réponse). Ne bloque jamais le
    // ticket : chaque envoi est protégé par son propre try/catch.
    after(async () => {
      try {
        await payload.sendEmail({
          to: email,
          // Reply-To par ticket → les réponses reviennent dans le dashboard
          // (via Brevo Inbound Parsing), si REPLY_DOMAIN est configuré.
          ...(process.env.REPLY_DOMAIN
            ? { replyTo: `ticket-${number}@${process.env.REPLY_DOMAIN}` }
            : {}),
          ...ticketConfirmationEmail({ name, email, subject, number }),
        });
      } catch (e) {
        console.warn("[tickets] e-mail confirmation échoué:", e);
      }

      try {
        await payload.sendEmail({
          to: SUPPORT_NOTIFY_EMAIL,
          ...newTicketNoticeEmail({ id: created.id, number, subject, type, name, email, service, url, description }),
        });
      } catch (e) {
        console.warn("[tickets] notification support échouée:", e);
      }
    });

    return NextResponse.json({ success: true, ticket_number: number });
  } catch (err) {
    console.error("[tickets] création échouée:", err);
    return fail("Impossible d'enregistrer votre demande. Réessayez plus tard.", 503);
  }
}
