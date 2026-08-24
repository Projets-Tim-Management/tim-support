import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import {
  ACCESS_EMAIL_KEY,
  CLOSED_STATUSES,
  SEND_CONDITIONS,
  decideEmail,
  shouldStillSend,
  type DueReason,
  type ScheduledEmail,
  type SendFacts,
} from "@/modules/marketing/lib/due-emails";
import { hasTemplate } from "@/modules/marketing/lib/emails";
import { notifyAdminsAccessMissing } from "@/modules/marketing/lib/notify";
import { sendJourneyEmail, sendPartnerWeeklyRecap } from "@/modules/marketing/lib/send";

/**
 * Envoi quotidien des messages datés du parcours.
 *
 * C'est ce qui rend une phase de test autonome : sans lui, les sept messages
 * échelonnés sur 30 jours (prise en main, remise des accès, suivi, bilan,
 * décision) restent rédigés mais ne partent jamais.
 *
 * Déclenché par Vercel Cron (voir vercel.json), qui ajoute
 * « Authorization: Bearer <CRON_SECRET> ».
 *
 * Le cron ne décide rien lui-même : il collecte, délègue la décision à
 * `decideEmail` (pure et testée) et l'envoi à `sendJourneyEmail` (qui pose le
 * Reply-To et marque `sentAt`). Il ne fait qu'orchestrer — et compter.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Parcours traités par exécution. Le reste attend le lendemain. */
const BATCH = 100;

type Run = {
  id: number | string;
  status?: string;
  client?: unknown;
  partner?: unknown;
  startDate?: string | null;
  endDate?: string | null;
  displayName?: string | null;
  currentStepLabel?: string | null;
  emails?: ScheduledEmail[];
  /** Personnes attendues à la session : destinataires des rappels de créneau. */
  attendeeEmail?: string | null;
  sessionGuests?: { email?: string | null }[] | null;
};

/**
 * Sommes-nous lundi à Paris ?
 *
 * Le jour se lit dans le fuseau de l'utilisateur, pas en UTC : le cron tourne à
 * 07:00 UTC, un calcul en UTC donnerait le bon jour ici mais deviendrait faux au
 * premier changement d'horaire d'exécution. `Intl` évite d'y penser.
 */
const isMondayInParis = (at: Date): boolean =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Europe/Paris" }).format(at) ===
  "Mon";

const idOf = (ref: unknown): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") return ((ref as { id?: number | string }).id ?? null) as number | string | null;
  return ref as number | string;
};

/**
 * Les faits dont dépendent les envois conditionnels, lus en une fois.
 *
 * Le créneau vit sur le parcours, l'état du dossier sur la fiche client, les
 * accès se comptent : trois sources, une seule lecture par parcours concerné.
 */
async function gatherFacts(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  run: Run,
  clientId: number | string,
): Promise<SendFacts> {
  const [client, credentials] = await Promise.all([
    payload
      .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true })
      .catch(() => null) as Promise<{ onboardingStatus?: string } | null>,
    payload
      .count({
        // Les accès prêts se comptent sur les utilisateurs qui ont un mot de
        // passe : sans ça, « Vos accès TIM sont prêts » ne partait jamais et TIM
        // recevait chaque matin de démarrage une fausse alerte « accès manquants ».
        collection: "client-contacts",
        where: { client: { equals: clientId }, timPassword: { exists: true } },
        overrideAccess: true,
      })
      .then((r) => r.totalDocs)
      .catch(() => 0),
  ]);

  return {
    sessionAt: (run as { sessionAt?: string | null }).sessionAt ?? null,
    onboardingStatus: client?.onboardingStatus ?? null,
    credentialCount: credentials,
  };
}

/**
 * Envois qui concernent la session de prise en main, et doivent donc atteindre
 * les personnes attendues — pas seulement le titulaire du compte client.
 */
const SESSION_EMAIL_KEYS = new Set(["rappel-creneau"]);

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // `dry=1` : liste ce qui partirait, sans rien envoyer. Indispensable pour
  // vérifier une séquence avant de la lâcher sur de vrais prospects.
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  const payload = await payloadClient();
  const now = Date.now();

  // Seuls les parcours OUVERTS sont chargés : filtrer en base plutôt qu'en
  // mémoire évite de parcourir tout l'historique chaque matin.
  const res = await payload.find({
    collection: "journey-runs",
    where: { status: { not_in: CLOSED_STATUSES } },
    limit: BATCH,
    depth: 0,
    overrideAccess: true,
    sort: "startDate",
  });

  const sent: string[] = [];
  const skipped: Record<string, number> = {};
  const failed: string[] = [];
  const note = (reason: DueReason | string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  for (const doc of res.docs as Run[]) {
    const run = doc;
    const clientId = idOf(run.client);

    for (const mail of run.emails ?? []) {
      const decision = decideEmail(mail, run.status, now, hasTemplate);
      if (!decision.send) {
        // « not_due » est le cas normal de la quasi-totalité des lignes : le
        // compter noierait le journal sans rien apprendre.
        if (decision.reason !== "not_due" && decision.reason !== "already_sent") {
          note(decision.reason);
          if (decision.reason === "too_late") {
            payload.logger.warn(
              `[cron] « ${mail.key} » du parcours ${run.id} abandonné : prévu le ${mail.scheduledAt}, trop tardif.`,
            );
          }
        }
        continue;
      }

      // Certains envois dépendent d'un FAIT et pas seulement d'une date : une
      // relance sur un dossier déjà transmis, ou « vos accès sont prêts » sans
      // aucun identifiant créé, se retournent contre nous. Les faits ne sont lus
      // que pour les messages qui en dépendent — inutile d'interroger la base
      // pour un conseil d'usage.
      if (mail.key && SEND_CONDITIONS[mail.key] && clientId != null) {
        const facts = await gatherFacts(payload, run, clientId);

        if (!shouldStillSend(mail.key, facts)) {
          note(`${mail.key}:sans_objet`);
          // Le seul cas où l'inaction demande une alerte : le jour du démarrage
          // sans aucun accès créé. Une relance sans objet, elle, est une bonne
          // nouvelle — le client a fait ce qu'on attendait.
          if (mail.key === ACCESS_EMAIL_KEY) {
            note("credentials_missing");
            if (!dry) {
              const client = (await payload
                .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true })
                .catch(() => null)) as { companyName?: string } | null;
              await notifyAdminsAccessMissing(payload, run, client?.companyName);
            }
          }
          continue;
        }
      }

      if (dry) {
        sent.push(`${run.id}:${mail.key}`);
        continue;
      }

      const result = await sendJourneyEmail(payload, {
        run,
        key: mail.key!,
        // Les envois qui parlent de la SESSION vont aussi à ceux qui y sont
        // attendus. Le compte du client n'est pas toujours celui qui se
        // connectera : un rappel envoyé au seul signataire manque exactement
        // les gens qu'il doit faire venir.
        ...(SESSION_EMAIL_KEYS.has(mail.key!)
          ? {
              alsoTo: [
                run.attendeeEmail,
                ...((run.sessionGuests ?? []) as { email?: string | null }[]).map((g) => g?.email),
              ],
            }
          : {}),
      });
      if (result.sent) sent.push(`${run.id}:${mail.key}`);
      else {
        failed.push(`${run.id}:${mail.key} (${result.reason})`);
        note(result.reason);
      }
    }
  }

  // ── Récapitulatif hebdomadaire des partenaires (le lundi) ─────────────────
  // Greffé sur le cron quotidien plutôt que déclaré à part : un cron de moins à
  // surveiller, et surtout une seule exécution à comprendre quand on se demande
  // « qu'est-ce qui est parti ce matin ? ».
  let recaps = 0;
  if (isMondayInParis(new Date(now))) {
    const parPartenaire = new Map<string, Run[]>();
    for (const doc of res.docs as Run[]) {
      const pid = idOf(doc.partner);
      if (pid == null) continue;
      const list = parPartenaire.get(String(pid)) ?? [];
      list.push(doc);
      parPartenaire.set(String(pid), list);
    }

    for (const [partnerId, list] of parPartenaire) {
      const partner = (await payload
        .findByID({ collection: "partners", id: partnerId, depth: 0, overrideAccess: true })
        .catch(() => null)) as { id: number | string; email?: string; displayName?: string } | null;
      if (!partner?.email) {
        note("partner_no_email");
        continue;
      }
      if (dry) {
        recaps++;
        continue;
      }
      const r = await sendPartnerWeeklyRecap(
        payload,
        partner,
        list.map((run) => ({
          clientName: run.displayName?.split(" — ")[0] ?? `parcours ${run.id}`,
          currentStep: run.currentStepLabel,
          endDate: run.endDate,
        })),
      );
      if (r.sent) recaps++;
      else note(`recap_${r.reason}`);
    }
  }

  const summary = {
    ok: true,
    dry,
    recaps,
    runs: res.docs.length,
    sent: sent.length,
    details: sent,
    failed,
    skipped,
  };
  payload.logger.info(
    `[cron] parcours : ${res.docs.length} ouverts, ${sent.length} envoi(s)${dry ? " (à blanc)" : ""}${
      failed.length ? `, ${failed.length} échec(s)` : ""
    }.`,
  );
  return NextResponse.json(summary);
}
