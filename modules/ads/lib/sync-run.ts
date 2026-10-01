import type { Payload } from "payload";

import { libraryTokenReminderDue } from "@/modules/ads/agent/sources/ad-library";
import { platformLabel } from "@/modules/ads/lib/platforms";
import { syncAccount, syncDecision, tokenAlertDue, type RawAccount, type SyncResult } from "@/modules/ads/lib/sync";
import { getPlatform, isMetaMock } from "@/modules/ads/platforms";
import type { AdPlatform } from "@/modules/ads/platforms/types";
import { adminEmails } from "@/modules/marketing/lib/notify";

/**
 * Un passage de synchro : tous les comptes, un par un (cron quotidien), ou un
 * seul (« Synchroniser maintenant »).
 *
 * Les comptes sont lus en BRUT (`payload.db`) : le jeton OAuth n'est pas
 * lisible par l'API et le jeton système y est masqué.
 *
 * L'interrupteur général des garde-fous n'arrête PAS la synchro : elle ne fait
 * que lire, et un tableau de bord figé ne protège de rien.
 */

type Env = Record<string, string | undefined>;
type Options = { now?: Date; env?: Env; only?: number | string; dry?: boolean; platformFor?: (key: string) => AdPlatform };

export type RunSummary = { results: SyncResult[]; alerted: string[] };

export async function runAdsSync(payload: Payload, opts: Options = {}): Promise<RunSummary> {
  const now = opts.now ?? new Date();
  const env = opts.env ?? process.env;
  const mock = isMetaMock(env);
  const platformFor = opts.platformFor ?? ((key: string) => getPlatform(key, env));

  const where = opts.only != null ? { id: { equals: opts.only } } : {};
  const res = (await payload.db.find({ collection: "ad-accounts", where, limit: 0, pagination: false } as never)) as { docs: RawAccount[] };

  const results: SyncResult[] = [];
  for (const acc of res.docs) {
    const decision = syncDecision(acc, mock, env);
    const name = acc.name ?? String(acc.id);
    if (decision !== "ok") {
      results.push({ id: acc.id, name, decision });
      continue;
    }
    if (opts.dry) {
      results.push({ id: acc.id, name, decision });
      continue;
    }
    let platform: AdPlatform;
    try {
      platform = platformFor(acc.platform ?? "meta");
    } catch (e) {
      // Adaptateur non configuré : dit sur la fiche, et on passe au suivant.
      const error = (e as Error).message;
      await payload.update({ collection: "ad-accounts", id: acc.id, data: { status: "erreur", lastError: error }, overrideAccess: true }).catch(() => null);
      results.push({ id: acc.id, name, decision, status: "erreur", error });
      continue;
    }
    const r = await syncAccount(payload, acc, platform, now);
    results.push(r);
    if (r.error) payload.logger.warn(`[publicité] synchro de « ${name} » : ${r.error}`);
  }

  // Alerte J-7 : un jeton OAuth qui arrive à échéance, une fois par échéance.
  const due = res.docs.filter((a) => syncDecision(a, mock, env) === "ok" && tokenAlertDue(a, now));
  const alerted: string[] = [];
  if (due.length && !opts.dry) {
    const to = await adminEmails(payload);
    if (to.length) {
      const lignes = due.map((a) => `• ${a.name} (${platformLabel(a.platform)}, ${a.externalId}) — jeton valable jusqu'au ${new Date(a.tokenExpiresAt!).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`);
      const sent = await payload
        .sendEmail({
          to: to.join(","),
          subject: `Publicité : ${due.length} compte(s) à reconnecter avant 7 jours`,
          text: [
            "Ces comptes publicitaires sont connectés par OAuth, et leur jeton arrive à échéance :",
            ...lignes,
            "",
            "À l'échéance, la synchro s'arrête et le tableau de bord se fige. Deux façons de l'éviter :",
            "• Publicité › Paramètres › Comptes publicitaires › « Connecter un compte Meta » (même compte, même historique) ;",
            "• ou poser un jeton d'utilisateur système sur la fiche du compte : il n'expire pas.",
          ].join("\n"),
        })
        .then(() => true)
        .catch((e) => {
          payload.logger.error(`[publicité] alerte J-7 non envoyée : ${e}`);
          return false;
        });
      if (sent) {
        for (const a of due) {
          await payload.update({ collection: "ad-accounts", id: a.id, data: { tokenAlertSentAt: now.toISOString() }, overrideAccess: true });
          alerted.push(a.name ?? String(a.id));
        }
      }
    }
  }

  // Rappel J-7 du jeton de la bibliothèque publicitaire (décision 1 du 29/09/2026 : renouvelé à la main).
  // Seulement par le passage complet du cron : un « Synchroniser maintenant » ne le renvoie pas.
  if (opts.only == null && !opts.dry) {
    const settings = (await payload.findGlobal({ slug: "ads-settings", overrideAccess: true })) as { adLibraryTokenExpiresAt?: string | null };
    if (libraryTokenReminderDue(settings.adLibraryTokenExpiresAt, now)) {
      const to = await adminEmails(payload);
      const until = new Date(settings.adLibraryTokenExpiresAt!).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
      const sent =
        to.length > 0 &&
        (await payload
          .sendEmail({
            to: to.join(","),
            subject: "Publicité : le jeton de la bibliothèque publicitaire expire dans 7 jours",
            text: [
              `Le jeton d'accès à la bibliothèque publicitaire Meta est valable jusqu'au ${until}.`,
              "Passé cette date, l'agent de campagne ne lit plus les publicités des concurrents.",
              "",
              "Pour le renouveler : générer un nouveau jeton (vérification d'identité Meta), le poser dans META_AD_LIBRARY_TOKEN sur Vercel,",
              "puis mettre à jour sa date d'expiration dans Publicité › Paramètres › Garde-fous.",
            ].join("\n"),
          })
          .then(() => true)
          .catch((e) => {
            payload.logger.error(`[publicité] rappel du jeton de la bibliothèque non envoyé : ${e}`);
            return false;
          }));
      if (sent) alerted.push("Bibliothèque publicitaire (jeton)");
    }
  }

  return { results, alerted };
}
