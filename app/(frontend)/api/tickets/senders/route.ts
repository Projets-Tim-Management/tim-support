import { NextResponse } from "next/server";

import { hasAdminRole, isSupport } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { getSenders } from "@/modules/support/lib/brevo";

/**
 * Adresses d'expédition disponibles pour répondre à un ticket : les expéditeurs
 * VÉRIFIÉS du compte Brevo. Réservé au back-office (admin / support).
 *
 * `default` est l'adresse du support (EMAIL_FROM) : c'est elle qui part si le
 * rédacteur ne choisit rien.
 */
export async function GET(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user) && !isSupport(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const senders = await getSenders();
  const fallback = process.env.EMAIL_FROM || "support@tim-management.co";
  // L'adresse du support d'abord : c'est le défaut, elle doit être en tête.
  const sorted = [...senders].sort((a, b) =>
    a.email === fallback ? -1 : b.email === fallback ? 1 : a.email.localeCompare(b.email),
  );

  return NextResponse.json({
    senders: sorted,
    default: fallback,
    defaultName: process.env.EMAIL_FROM_NAME || "TIM Support",
  });
}
