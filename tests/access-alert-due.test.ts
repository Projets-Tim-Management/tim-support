import { describe, expect, it } from "vitest";

import { LATE_GRACE_HOURS, isRetentionAlertDue } from "@/modules/marketing/lib/due-emails";

/**
 * Cadence de l'alerte « accès manquants ».
 *
 * Le cron RETIENT « Vos accès TIM sont prêts » tant qu'aucun identifiant n'a
 * été créé — annoncer des accès inexistants un matin de démarrage est pire que
 * se taire. Cette rétention doit être signalée, sinon personne ne crée les
 * comptes : l'alerte est la contrepartie nécessaire du silence.
 *
 * Mais elle était émise à CHAQUE passage. Le cron étant devenu horaire et la
 * fenêtre de rattrapage durant 36 h, cela faisait jusqu'à trente-six alertes à
 * tous les admins pour un seul client. Une alerte qui arrive trente-six fois
 * n'est plus une alerte : on apprend à la fermer sans la lire, et le jour où
 * elle compte vraiment, personne ne la voit.
 *
 * La règle retenue : l'alerte se cale sur l'HEURE À LAQUELLE le message devait
 * partir. Elle dit littéralement « il devait partir maintenant » — et elle ne
 * revient qu'une fois par jour tant que la rétention dure, ce qui est
 * exactement le rythme d'avant la bascule en cron horaire.
 */

/** « Vos accès sont prêts » : 08:00 à Paris le matin du démarrage (= 06:00 UTC l'été). */
const PREVU = "2026-08-31T06:00:00.000Z";
const t = (iso: string) => Date.parse(iso);

describe("échéance de l'alerte « accès manquants »", () => {
  it("alerte à l'heure où le message devait partir", () => {
    expect(isRetentionAlertDue(t(PREVU), PREVU)).toBe(true);
  });

  it("n'alerte qu'une fois dans la journée", () => {
    const passages = Array.from({ length: 24 }, (_, h) =>
      isRetentionAlertDue(t(`2026-08-31T${String(h).padStart(2, "0")}:00:00.000Z`), PREVU),
    );
    expect(passages.filter(Boolean)).toHaveLength(1);
  });

  it("revient le lendemain, tant que les accès manquent", () => {
    // La rétention peut durer jusqu'à la fin de la fenêtre de rattrapage : le
    // rappel du lendemain est utile, les 23 autres du jour ne le sont pas.
    expect(isRetentionAlertDue(t("2026-09-01T06:00:00.000Z"), PREVU)).toBe(true);
  });

  it("reste sous une poignée d'alertes sur toute la fenêtre de rattrapage", () => {
    // Le comportement d'avant la bascule en cron horaire : deux alertes, pas trente-six.
    const debut = t(PREVU);
    const passages = Array.from({ length: LATE_GRACE_HOURS + 1 }, (_, h) =>
      isRetentionAlertDue(debut + h * 3_600_000, PREVU),
    );
    expect(passages.filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(passages.filter(Boolean).length).toBeGreaterThan(0);
  });

  it("suit l'heure de Paris, pas celle du serveur", () => {
    // Un envoi calé à 08:00 Paris en HIVER vaut 07:00 UTC. Comparer des heures
    // UTC ferait dériver l'alerte d'une heure deux fois par an — et la ferait
    // tomber un passage à côté du bon.
    const hiver = "2026-01-12T07:00:00.000Z";
    expect(isRetentionAlertDue(t(hiver), hiver)).toBe(true);
    expect(isRetentionAlertDue(t("2026-01-12T06:00:00.000Z"), hiver)).toBe(false);
  });

  it("n'alerte pas sans date d'envoi prévue", () => {
    expect(isRetentionAlertDue(t(PREVU), null)).toBe(false);
    expect(isRetentionAlertDue(t(PREVU), undefined)).toBe(false);
    expect(isRetentionAlertDue(t(PREVU), "pas une date")).toBe(false);
  });
});
