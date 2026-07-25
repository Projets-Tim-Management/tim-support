import { NextResponse } from "next/server";

import { payloadClient } from "@/lib/payload-client";

const TICKET_TYPES = ["assistance", "suggestion", "autre"];
const TICKET_SERVICES = ["technique", "facturation", "support", "commercial", "autre"];
const ALLOWED_MIME = /^image\/(jpeg|png|gif|webp)$/;
const MAX_FILE = 5 * 1024 * 1024; // 5 Mo

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
    const attachments: number[] = [];
    if (type === "assistance") {
      for (const [key, value] of form.entries()) {
        if (
          key.startsWith("attachment_") &&
          value instanceof File &&
          value.size > 0 &&
          value.size <= MAX_FILE &&
          ALLOWED_MIME.test(value.type)
        ) {
          const buffer = Buffer.from(await value.arrayBuffer());
          const media = await payload.create({
            collection: "media",
            data: { alt: value.name },
            file: { data: buffer, mimetype: value.type, name: value.name, size: buffer.length },
          });
          attachments.push(media.id as number);
        }
      }
    }

    const number = Math.floor(Math.random() * 98999) + 1000;
    await payload.create({
      collection: "tickets",
      data: {
        number,
        subject,
        description,
        email,
        name: name || undefined,
        url: url || undefined,
        service,
        type,
        status: "new",
        priority: "normal",
        attachments,
        ip: req.headers.get("x-forwarded-for") ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    });

    return NextResponse.json({ success: true, ticket_number: number });
  } catch (err) {
    console.error("[tickets] création échouée:", err);
    return fail("Impossible d'enregistrer votre demande. Réessayez plus tard.", 503);
  }
}
