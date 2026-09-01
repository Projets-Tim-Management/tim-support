import { describe, expect, it } from "vitest";

import {
  croiserEnvois,
  evenementsOrphelins,
  ordonnerEnvois,
  sortDesEvenements,
  type EnvoiCroise,
  type EnvoiPrevu,
  type EvenementBrevo,
  type Sort,
} from "@/modules/marketing/lib/journey-mail-status";

/**
 * Ce que le parcours CROIT, face à ce que le client a REÇU.
 *
 * La barre d'étapes dit « envoyé » : c'est l'état du logiciel, pas celui de la
 * boîte aux lettres. Un message parti puis rejeté y figure comme envoyé, et
 * personne ne l'apprend — c'est exactement la question posée sur SOCOM, à
 * laquelle il a fallu interroger Brevo à la main pour répondre.
 */

const LE_31 = Date.parse("2026-08-31T12:00:00.000Z");
const ev = (event: string, date: string, subject: string, extra: Partial<EvenementBrevo> = {}): EvenementBrevo =>
  ({ event, date, subject, ...extra });

describe("sort d'un message, d'après ses évènements", () => {
  it("retient l'étape la plus avancée, pas la dernière reçue", () => {
    // Brevo rend la suite complète et pas toujours dans l'ordre : « requests »
    // après « opened » ne veut pas dire que le message est revenu en arrière.
    const s = sortDesEvenements([
      ev("opened", "2026-08-28T18:33:00Z", "X"),
      ev("requests", "2026-08-28T18:33:00Z", "X"),
      ev("delivered", "2026-08-28T18:33:00Z", "X"),
    ]);
    expect(s?.sort).toBe("ouvert");
    expect(s?.ouvert).toBe(true);
  });

  it("compte les clics", () => {
    const s = sortDesEvenements([
      ev("delivered", "2026-08-28T18:33:00Z", "X"),
      ev("clicks", "2026-08-28T18:34:00Z", "X"),
      ev("clicks", "2026-08-28T18:34:00Z", "X"),
    ]);
    expect(s?.sort).toBe("clique");
    expect(s?.clics).toBe(2);
  });

  it("un ÉCHEC prime sur tout le reste", () => {
    // C'est la seule ligne qui demande une action : elle ne doit pas être
    // masquée par un « remis » antérieur sur le même message.
    for (const panne of ["hardBounces", "softBounces", "blocked", "spam", "invalid"]) {
      const s = sortDesEvenements([
        ev("requests", "2026-08-28T18:33:00Z", "X"),
        ev("delivered", "2026-08-28T18:33:00Z", "X"),
        ev(panne, "2026-08-28T18:35:00Z", "X", { reason: "boîte pleine" }),
      ]);
      expect(s?.sort, panne).toBe("echec");
      expect(s?.raison, panne).toBe("boîte pleine");
    }
  });

  it("ne dit rien quand il n'y a rien à dire", () => {
    expect(sortDesEvenements([])).toBeNull();
  });
});

describe("croisement avec la séquence prévue", () => {
  const prevus: EnvoiPrevu[] = [
    { key: "invitation-espace-client", subject: "Votre espace client TIM est ouvert", audience: "client", sentAt: null },
    { key: "prise-en-main", subject: "45 minutes pour rendre votre équipe autonome", audience: "client", scheduledAt: "2026-09-07T06:00:00Z" },
    { key: "relance-dossier", subject: "Votre dossier de démarrage nous manque", audience: "client", scheduledAt: "2026-08-20T06:00:00Z" },
    { key: "recap-partenaire", subject: "Vos tests en cours", audience: "partenaire" },
  ];

  it("rattache les évènements à la bonne ligne, par objet", () => {
    // Le cas SOCOM : la base dit « jamais envoyé », Brevo dit « ouvert ».
    const out = croiserEnvois(
      prevus,
      [
        ev("requests", "2026-08-28T18:33:00Z", "Votre espace client TIM est ouvert"),
        ev("delivered", "2026-08-28T18:33:00Z", "Votre espace client TIM est ouvert"),
        ev("opened", "2026-08-28T18:33:00Z", "Votre espace client TIM est ouvert"),
      ],
      LE_31,
    );
    expect(out[0]).toMatchObject({ key: "invitation-espace-client", sort: "ouvert", ouvert: true });
  });

  it("distingue « à venir » de « NON PARTI »", () => {
    // Le signal qu'aucun autre écran ne donne : l'heure est passée, rien n'est
    // parti. La barre d'étapes, elle, affiche « à envoyer » dans les deux cas.
    const out = croiserEnvois(prevus, [], LE_31);
    expect(out.find((e) => e.key === "prise-en-main")?.sort).toBe("a-venir");
    expect(out.find((e) => e.key === "relance-dossier")?.sort).toBe("non-parti");
  });

  it("marque « non programmé » un envoi sans date", () => {
    // Déclenché par un évènement, pas par le calendrier : ce n'est pas un retard.
    expect(croiserEnvois(prevus, [], LE_31).find((e) => e.key === "recap-partenaire")?.sort)
      .toBe("non-programme");
  });

  it("croit le parcours quand Brevo ne sait rien de la ligne", () => {
    const out = croiserEnvois([{ key: "k", subject: "S", sentAt: "2026-08-01T10:00:00Z" }], [], LE_31);
    expect(out[0].sort).toBe("envoye");
    expect(out[0].date).toBe("2026-08-01T10:00:00Z");
  });

  it("rapproche malgré la casse et les espaces en trop", () => {
    const out = croiserEnvois(
      [{ key: "k", subject: "Votre espace client TIM est ouvert" }],
      [ev("delivered", "2026-08-28T18:33:00Z", "  votre  ESPACE client TIM est ouvert ")],
      LE_31,
    );
    expect(out[0].sort).toBe("remis");
  });

  it("écarte les lignes sans clé plutôt que d'afficher des vides", () => {
    expect(croiserEnvois([{ subject: "orphelin" }, { key: "" }] as EnvoiPrevu[], [], LE_31)).toEqual([]);
  });

  it("préserve l'ordre de la séquence", () => {
    expect(croiserEnvois(prevus, [], LE_31).map((e) => e.key)).toEqual([
      "invitation-espace-client",
      "prise-en-main",
      "relance-dossier",
      "recap-partenaire",
    ]);
  });
});

describe("évènements qu'aucune ligne ne revendique", () => {
  it("les ressort au lieu de les jeter", () => {
    // Un code de connexion porte un objet variable (« 004851 — votre code… ») :
    // il ne correspondra jamais à une ligne, mais le client l'a bien reçu.
    const orphelins = evenementsOrphelins(
      [{ key: "invitation-espace-client", subject: "Votre espace client TIM est ouvert" }],
      [
        ev("delivered", "2026-08-31T11:49:00Z", "004851 — votre code de connexion TIM"),
        ev("delivered", "2026-08-28T18:33:00Z", "Votre espace client TIM est ouvert"),
      ],
    );
    expect(orphelins).toHaveLength(1);
    expect(orphelins[0].subject).toContain("code de connexion");
  });
});

describe("ordre de lecture", () => {
  const e = (key: string, sort: Sort, date: string | null): EnvoiCroise => ({
    key,
    subject: key,
    audience: "client",
    sort,
    date,
    raison: null,
    ouvert: false,
    clics: 0,
  });

  it("met d'abord ce qui s'est passé, du plus récent au plus ancien", () => {
    const out = ordonnerEnvois([
      e("vieux", "remis", "2026-08-01T10:00:00Z"),
      e("recent", "clique", "2026-08-28T18:00:00Z"),
    ]);
    expect(out.map((x) => x.key)).toEqual(["recent", "vieux"]);
  });

  it("place les problèmes dans ce premier groupe, pas à la fin", () => {
    // Un envoi qui n'est jamais parti demande une action : il ne doit pas se
    // retrouver sous dix lignes « à venir ».
    const out = ordonnerEnvois([
      e("futur", "a-venir", "2026-09-07T06:00:00Z"),
      e("rate", "non-parti", "2026-08-20T06:00:00Z"),
    ]);
    expect(out[0].key).toBe("rate");
  });

  it("puis l'avenir, du plus proche au plus lointain", () => {
    const out = ordonnerEnvois([
      e("loin", "a-venir", "2026-10-12T06:00:00Z"),
      e("bientot", "a-venir", "2026-09-07T06:00:00Z"),
    ]);
    expect(out.map((x) => x.key)).toEqual(["bientot", "loin"]);
  });

  it("relègue à la fin ce qui dépend d'un évènement", () => {
    const out = ordonnerEnvois([
      e("evenement", "non-programme", null),
      e("futur", "a-venir", "2026-09-07T06:00:00Z"),
      e("passe", "remis", "2026-08-01T10:00:00Z"),
    ]);
    expect(out.map((x) => x.key)).toEqual(["passe", "futur", "evenement"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const source = [e("b", "a-venir", "2026-09-07T06:00:00Z"), e("a", "remis", "2026-08-01T10:00:00Z")];
    ordonnerEnvois(source);
    expect(source.map((x) => x.key)).toEqual(["b", "a"]);
  });
});

/**
 * Le cas SOCOM du 01/09/2026 : session de prise en main calée en direct, et
 * l'onglet annonçait toujours « À venir » pour les deux messages qui invitent
 * à la réserver. Le cron, lui, les écarte — l'écran mentait, pas l'envoi.
 */
describe("croiserEnvois — envois annulés par les faits", () => {
  const invitation = {
    key: "prise-en-main",
    subject: "45 minutes pour rendre votre équipe autonome",
    audience: "client",
    scheduledAt: "2026-09-07T06:00:00.000Z",
    sentAt: null,
  };
  const relance = {
    key: "relance-creneau",
    subject: "Il reste à réserver votre session de prise en main",
    audience: "client",
    scheduledAt: "2026-09-10T06:00:00.000Z",
    sentAt: null,
  };
  const avant = Date.parse("2026-09-01T12:00:00.000Z");

  it("dit « sans objet » quand le créneau est déjà réservé", () => {
    const out = croiserEnvois([invitation, relance], [], avant, {
      sessionAt: "2026-09-14T08:00:00.000Z",
    });
    expect(out.map((e) => e.sort)).toEqual(["sans-objet", "sans-objet"]);
    expect(out[0].raison).toBe("créneau déjà réservé");
  });

  it("les laisse « à venir » tant qu'aucun créneau n'existe", () => {
    const out = croiserEnvois([invitation, relance], [], avant, {});
    expect(out.map((e) => e.sort)).toEqual(["a-venir", "a-venir"]);
  });

  it("ne réécrit pas un message DÉJÀ parti", () => {
    // Il est dans la boîte du client : le dire annulé serait faux, et
    // ferait chercher un envoi qui a bien eu lieu.
    const out = croiserEnvois(
      [{ ...invitation, sentAt: "2026-08-25T06:00:00.000Z" }],
      [],
      avant,
      { sessionAt: "2026-09-14T08:00:00.000Z" },
    );
    expect(out[0].sort).toBe("envoye");
  });

  it("laisse le constat de Brevo primer sur la condition", () => {
    // Envoyé puis rejeté AVANT la réservation : c'est un incident réel, il
    // reste à l'écran même si la relance n'a plus lieu d'être aujourd'hui.
    const out = croiserEnvois([invitation], [
      { date: "2026-08-25T06:00:00.000Z", event: "hardBounces", subject: invitation.subject, reason: "unknown user" },
    ], avant, { sessionAt: "2026-09-14T08:00:00.000Z" });
    expect(out[0].sort).toBe("echec");
  });

  it("ne touche pas à « Vos accès TIM sont prêts » : il est retenu, pas annulé", () => {
    // Sa condition n'est pas remplie parce que TIM n'a rien créé. L'afficher
    // « sans objet » masquerait le travail qui reste à faire.
    const out = croiserEnvois(
      [{ key: "acces-prets", subject: "Vos accès TIM sont prêts", audience: "client", scheduledAt: "2026-08-20T06:00:00.000Z", sentAt: null }],
      [],
      avant,
      { credentialCount: 0 },
    );
    expect(out[0].sort).toBe("non-parti");
  });

  it("relègue les envois sans objet après ce qui est encore attendu", () => {
    const out = ordonnerEnvois(
      croiserEnvois([invitation, { ...relance, key: "fin-proche", subject: "Votre test se termine dans 5 jours" }], [], avant, {
        sessionAt: "2026-09-14T08:00:00.000Z",
      }),
    );
    expect(out.map((e) => e.key)).toEqual(["fin-proche", "prise-en-main"]);
  });
});
