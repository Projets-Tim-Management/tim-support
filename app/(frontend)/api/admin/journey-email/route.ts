import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { sessionSummary, stepDueDate } from "@/modules/marketing/lib/journey";
import {
  buildContractRequestEmail,
  buildDossierToCheckEmail,
  buildQuoteEmail,
  buildTestRequestEmail,
} from "@/modules/marketing/lib/notify";

/**
 * Aperçu d'un e-mail du parcours, tel qu'il partira.
 *
 * GET ?runId=…&key=…  → { subject, html } ou { pending, … }
 *
 * L'aperçu appelle les MÊMES fonctions de fabrication que l'envoi réel : ce
 * qu'on voit est ce qui partira, pas une maquette qui dériverait à la première
 * modification du modèle.
 *
 * Tous les messages ne sont pas encore rédigés. Plutôt que d'inventer un corps
 * plausible — ce qui donnerait une fausse confiance —, on renvoie ce qui EST
 * défini (objet, destinataire, moment, intention) et on dit franchement que le
 * texte reste à écrire.
 */

type RunEmail = {
  key?: string;
  subject?: string;
  audience?: string;
  trigger?: string;
  detail?: string;
  scheduledAt?: string | null;
  sentAt?: string | null;
};

type Run = {
  id: number | string;
  client?: number | string;
  partner?: number | string;
  startDate?: string;
  endDate?: string;
  emails?: RunEmail[];
  steps?: { key?: string; anchor?: string; offsetDays?: number }[];
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const key = url.searchParams.get("key");
  if (!runId || !key) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const run = (await payload
    .findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true })
    .catch(() => null)) as Run | null;
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Un partenaire ne consulte que les parcours de SA fiche.
  const own = partnerIdOf(user);
  const allowed =
    hasAdminRole(user) || (isPartnerMetier(user) && String(own) === String(run.partner ?? ""));
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const mail = (run.emails ?? []).find((e) => e.key === key);
  if (!mail) return NextResponse.json({ error: "unknown_email" }, { status: 404 });

  const [client, partner, credentialCount] = await Promise.all([
    run.client
      ? payload.findByID({ collection: "partner-clients", id: run.client, depth: 0, overrideAccess: true }).catch(() => null)
      : null,
    run.partner
      ? payload.findByID({ collection: "partners", id: run.partner, depth: 0, overrideAccess: true }).catch(() => null)
      : null,
    run.client
      ? payload
          .count({ collection: "client-credentials", where: { client: { equals: run.client } }, overrideAccess: true })
          .then((r) => r.totalDocs)
          .catch(() => 0)
      : Promise.resolve(0),
  ]);
  const credentials = credentialCount as number;

  const meta = {
    key,
    subject: mail.subject ?? null,
    audience: mail.audience ?? "client",
    trigger: mail.trigger ?? null,
    detail: mail.detail ?? null,
    scheduledAt: mail.scheduledAt ?? null,
    sentAt: mail.sentAt ?? null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = client as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = partner as any;

  switch (key) {
    case "demande-recue": {
      const built = buildTestRequestEmail(run, {
        client: c ? { id: c.id, companyName: c.companyName, siren: c.siren, email: c.email, totalLicences: c.totalLicences, caPaye: c.caPaye } : null,
        partner: p ? { id: p.id, displayName: p.displayName, societe: p.societe, email: p.email } : null,
        checklist: null,
      });
      return NextResponse.json({ ...meta, ...built, pending: false });
    }

    case "devis-a-rediger": {
      const built = buildQuoteEmail(run, {
        client: c
          ? {
              id: c.id,
              companyName: c.companyName,
              siren: c.siren,
              email: c.email,
              raisonSociale: c.raisonSociale,
              billingAddress: c.billingAddress,
              caPaye: c.caPaye,
              licences: c.licences,
            }
          : null,
        partner: p ? { id: p.id, displayName: p.displayName, email: p.email } : null,
      });
      return NextResponse.json({ ...meta, ...built, pending: false });
    }

    case "dossier-a-verifier": {
      const built = buildDossierToCheckEmail(run, {
        clientName: c?.companyName,
        partnerName: p?.displayName,
        clientId: c?.id,
      });
      return NextResponse.json({ ...meta, ...built, pending: false });
    }

    case "demande-contrat-tim": {
      const built = buildContractRequestEmail(run, {
        clientName: c?.companyName,
        partnerName: p?.displayName,
        clientId: c?.id,
      });
      return NextResponse.json({ ...meta, ...built, pending: false });
    }

    default: {
      // Messages au client et au partenaire : gabarits rédigés, alimentés par
      // les données réelles du parcours.
      const template = JOURNEY_EMAILS[key];
      if (!template) return NextResponse.json({ ...meta, pending: true });

      // L'échéance annoncée au client EST celle de l'étape « Dossier de
      // démarrage complété » : le texte ne réinvente pas un délai de son côté.
      const dossierStep = (run.steps ?? []).find((st) => st.key === "dossier-demarrage");
      const dossierDeadline = dossierStep
        ? stepDueDate(dossierStep, run.startDate ?? null, run.endDate ?? null)
        : null;

      const built = template({
        clientName: c?.companyName,
        dossierDeadline,
        partnerName: p?.displayName,
        startDate: run.startDate,
        endDate: run.endDate,
        sessionAt: (run as { sessionAt?: string }).sessionAt,
        sessionModality: sessionSummary(run as never),
        credentialCount: credentials,
        // Le vrai code est tiré au hasard à l'envoi et n'est jamais conservé en
        // clair : l'aperçu en montre un d'exemple, et le dit.
        code: key === "code-connexion" ? "123456" : undefined,
      });
      return NextResponse.json({
        ...meta,
        ...built,
        pending: false,
        sample: key === "code-connexion",
      });
    }
  }
}
