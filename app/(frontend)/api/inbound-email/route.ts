import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";

// Webhook d'e-mails entrants (Brevo Inbound Parsing).
// Quand un client répond à la confirmation (Reply-To ticket-<n>@REPLY_DOMAIN),
// Brevo POSTe le message ici → on l'ajoute au fil du ticket correspondant.
// Protégé par une clé en query (?key=...) car Brevo ne signe pas les webhooks.
export const dynamic = "force-dynamic";

/** Comparaison à temps constant d'une clé fournie avec INBOUND_SECRET. */
function keyIsValid(provided: string | null): boolean {
  const secret = process.env.INBOUND_SECRET ?? "";
  if (!secret || !provided || provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

function extractTicketNumber(recipients: string[]): number | null {
  for (const r of recipients) {
    const m = /ticket-(\d+)@/i.exec(r);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Aplati les diverses formes de destinataires Brevo en liste d'adresses. */
function collectAddresses(value: unknown, out: string[]): void {
  if (!value) return;
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectAddresses(v, out));
  else if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.Address === "string") out.push(o.Address);
    else if (typeof o.address === "string") out.push(o.address);
  }
}

export async function POST(req: Request) {
  // Secret dédié obligatoire (jamais de repli sur PAYLOAD_SECRET, qui ne doit
  // pas transiter en clair dans une URL de webhook).
  if (!keyIsValid(new URL(req.url).searchParams.get("key"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const items = Array.isArray((body as { items?: unknown[] }).items)
    ? ((body as { items: unknown[] }).items as Record<string, unknown>[])
    : [body];

  const payload = await payloadClient();
  let handled = 0;

  for (const item of items) {
    const recips: string[] = [];
    collectAddresses(item.To, recips);
    collectAddresses(item.Recipients, recips);
    collectAddresses(item.Cc, recips);

    const number = extractTicketNumber(recips);
    if (!number) continue;

    const found = await payload.find({
      collection: "tickets",
      where: { number: { equals: number } },
      limit: 1,
      depth: 0,
    });
    const ticket = found.docs[0] as { id: number; status?: string; messages?: unknown[] } | undefined;
    if (!ticket) continue;

    const text = (
      (item.ExtractedMarkdownMessage as string) ||
      (item.RawTextBody as string) ||
      (item.Text as string) ||
      ""
    )
      .toString()
      .trim()
      .slice(0, 20000);
    if (!text) continue;

    const messages = Array.isArray(ticket.messages) ? ticket.messages : [];
    messages.push({ author: "client", body: text, sentAt: new Date().toISOString() });

    await payload.update({
      collection: "tickets",
      id: ticket.id,
      data: {
        messages,
        // Une réponse client ré-ouvre un ticket résolu.
        ...(ticket.status === "resolved" ? { status: "new" } : {}),
      },
    });
    handled++;
  }

  return NextResponse.json({ ok: true, handled });
}
