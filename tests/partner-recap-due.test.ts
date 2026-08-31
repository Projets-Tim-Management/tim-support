import { describe, expect, it } from "vitest";

import { PARTNER_RECAP_KEY, isPartnerRecapDue } from "@/modules/marketing/lib/due-emails";
import { DEFAULT_SEND_HOUR, PHASE_DE_TEST_EMAILS } from "@/modules/marketing/lib/journey";

/**
 * Le récapitulatif hebdomadaire part UNE fois par lundi.
 *
 * Il ne peut pas s'appuyer sur `sentAt` — c'est le seul message récurrent du
 * parcours, le marquer l'empêcherait de repartir la semaine suivante. Sa
 * non-duplication tient donc entièrement à cette condition d'horaire.
 *
 * Le cron a été passé de quotidien (07:00 UTC) à HORAIRE pour honorer les
 * `sendHour` des envois datés (commit 041e2c8). Ce bloc-ci, lui, ne testait que
 * le jour : chaque partenaire ayant un test ouvert recevait donc le même
 * récapitulatif VINGT-QUATRE fois tous les lundis. Rien dans la base ne pouvait
 * le révéler, faute justement de marquage — d'où ce test.
 */

const heure = PHASE_DE_TEST_EMAILS.find((e) => e.key === PARTNER_RECAP_KEY)?.sendHour ?? DEFAULT_SEND_HOUR;

/** Instant précis, exprimé en UTC — c'est ainsi que le cron voit le temps. */
const t = (iso: string) => Date.parse(iso);

describe("échéance du récapitulatif partenaire", () => {
  it("part au passage de 8 h à Paris, un lundi", () => {
    // Été : 08:00 à Paris = 06:00 UTC.
    expect(isPartnerRecapDue(t("2026-07-06T06:00:00.000Z"), heure)).toBe(true);
  });

  it("ne part qu'une seule fois dans la journée du lundi", () => {
    // Les 24 passages du cron ce lundi-là : un seul doit déclencher l'envoi.
    const passages = Array.from({ length: 24 }, (_, h) =>
      isPartnerRecapDue(t(`2026-07-06T${String(h).padStart(2, "0")}:00:00.000Z`), heure),
    );
    expect(passages.filter(Boolean)).toHaveLength(1);
  });

  it("tient compte du changement d'heure", () => {
    // Hiver : 08:00 à Paris = 07:00 UTC. Un décalage codé en dur raterait l'un
    // des deux — et un partenaire ne verrait rien venir six mois par an.
    const lundiHiver = Array.from({ length: 24 }, (_, h) =>
      isPartnerRecapDue(t(`2026-01-12T${String(h).padStart(2, "0")}:00:00.000Z`), heure),
    );
    expect(lundiHiver.filter(Boolean)).toHaveLength(1);
    expect(isPartnerRecapDue(t("2026-01-12T07:00:00.000Z"), heure)).toBe(true);
  });

  it("ne part aucun autre jour de la semaine", () => {
    // Mardi → dimanche, aux 24 heures : jamais.
    for (const jour of ["07", "08", "09", "10", "11", "12"]) {
      for (let h = 0; h < 24; h += 1) {
        const at = t(`2026-07-${jour}T${String(h).padStart(2, "0")}:00:00.000Z`);
        expect(isPartnerRecapDue(at, heure), `2026-07-${jour} ${h}h UTC`).toBe(false);
      }
    }
  });

  it("respecte l'heure déclarée dans le modèle, pas une valeur recopiée", () => {
    // Si l'équipe déplace le récap à 10 h dans le modèle, l'envoi suit.
    expect(isPartnerRecapDue(t("2026-07-06T08:00:00.000Z"), "10:00")).toBe(true);
    expect(isPartnerRecapDue(t("2026-07-06T06:00:00.000Z"), "10:00")).toBe(false);
  });

  it("l'envoi déclaré dans le modèle existe bien sous cette clé", () => {
    // Sans cela, un renommage de clé rendrait la condition inatteignable et le
    // récapitulatif cesserait de partir, sans erreur nulle part.
    expect(PHASE_DE_TEST_EMAILS.map((e) => e.key)).toContain(PARTNER_RECAP_KEY);
  });
});
