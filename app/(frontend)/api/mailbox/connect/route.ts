import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { signState } from "@/core/lib/secrets";
import { mailboxAuthUrl, mailboxConfigured } from "@/modules/partner/lib/mailbox/gmail-auth";

/**
 * GET /api/mailbox/connect → écran de consentement Google.
 *
 * On connecte SA PROPRE boîte, jamais celle d'un autre : l'identité vient de la
 * session, pas d'un paramètre d'URL. C'est aussi ce qui garantit qu'au retour,
 * la boîte enregistrée est bien celle de la personne qui a consenti.
 */
export const dynamic = "force-dynamic";

/** Profondeur de la reprise initiale, en mois. */
const HISTORY_MONTHS = 12;

export async function GET(req: Request) {
  if (!mailboxConfigured()) {
    return NextResponse.json({ error: "google_mail_non_configure" }, { status: 501 });
  }

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const since = new Date();
  since.setMonth(since.getMonth() - HISTORY_MONTHS);

  // State signé et daté : il porte l'identité de la demande jusqu'au retour.
  const state = signState({ userId: user.id, since: since.toISOString() });
  return NextResponse.redirect(mailboxAuthUrl(state));
}
