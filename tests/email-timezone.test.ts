import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";

/**
 * Une heure annoncée par e-mail est une heure de PARIS.
 *
 * Les créneaux sont raisonnés en heure locale puis stockés en UTC (voir
 * scheduling.ts). Les fonctions Vercel, elles, tournent en UTC : un
 * `toLocaleString` sans `timeZone` y rend l'heure brute du stockage. En été,
 * cela fait DEUX heures d'écart — le client lit 08:00 pour une session de
 * 10:00, et l'alerte interne, qui précisait bien le fuseau, en annonce une
 * troisième. C'est parti en production sur le parcours 7 (frapose, 27/08/2026).
 *
 * Deux garde-fous complémentaires ici :
 *  - le rendu réel des gabarits, en été comme en hiver ;
 *  - une relecture du CODE, qui attrape un futur `toLocale…` sans fuseau même
 *    dans un gabarit qu'on n'aurait pas pensé à couvrir.
 */

/** Heure telle qu'un lecteur à Paris doit la lire. */
const aParis = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** Heure brute du stockage — ce qui ne doit JAMAIS apparaître dans un message. */
const enUTC = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** Gabarits qui annoncent l'horaire de la session de prise en main. */
const AVEC_HORAIRE = ["creneau-confirme", "rappel-creneau", "creneau-reserve"] as const;

const contexte = (sessionAt: string) => ({
  clientName: "PIANCATELLI TOITURES",
  contactFirstName: "Charlie",
  partnerName: "Tim Management",
  sessionAt,
  sessionModality: "en visio",
  sessionLink: "https://meet.example.com/abc",
});

describe("les heures annoncées sont des heures de Paris", () => {
  // Été (UTC+2) et hiver (UTC+1) : un décalage codé en dur passerait l'un des deux.
  for (const [saison, sessionAt] of [
    ["en été", "2026-07-08T13:00:00.000Z"],
    ["en hiver", "2026-01-14T13:00:00.000Z"],
  ] as const) {
    it(`annonce l'heure locale du client ${saison}`, () => {
      for (const key of AVEC_HORAIRE) {
        const mail = JOURNEY_EMAILS[key](contexte(sessionAt));
        expect(mail.text, key).toContain(aParis(sessionAt));
        expect(mail.html, key).toContain(aParis(sessionAt));
      }
    });

    it(`ne laisse jamais fuir l'heure de stockage ${saison}`, () => {
      // Sur TOUS les gabarits, pas seulement ceux qu'on sait porteurs d'un
      // horaire : un futur message qui en afficherait un serait couvert d'office.
      for (const [key, build] of Object.entries(JOURNEY_EMAILS)) {
        const mail = build(contexte(sessionAt));
        expect(mail.text, key).not.toContain(enUTC(sessionAt));
        expect(mail.html, key).not.toContain(enUTC(sessionAt));
      }
    });
  }

  it("garde le bon JOUR quand Paris et UTC n'en sont plus au même", () => {
    // 23:30 UTC un mercredi = 01:30 le jeudi à Paris. Le fuseau ne décale pas
    // qu'une heure : il change la date, et un rendez-vous annoncé la veille ne
    // se rattrape pas.
    const sessionAt = "2026-07-08T23:30:00.000Z";
    const jourParis = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      day: "2-digit",
      month: "long",
    }).format(new Date(sessionAt));

    for (const key of AVEC_HORAIRE) {
      const mail = JOURNEY_EMAILS[key](contexte(sessionAt));
      expect(mail.text, key).toContain(jourParis);
    }
  });
});

/** Modules dont chaque date affichée part chez quelqu'un. */
const SOURCES_A_RELIRE = [
  "modules/marketing/lib/emails.ts",
  "modules/marketing/lib/notify.ts",
  "core/lib/email-template.ts",
  "modules/partner/lib",
  "modules/support/lib",
];

const fichiersTs = (chemin: string): string[] => {
  if (statSync(chemin).isFile()) return [chemin];
  return readdirSync(chemin)
    .filter((n) => n.endsWith(".ts") && !/ \d+\.ts$/.test(n))
    .map((n) => join(chemin, n));
};

/**
 * Appels `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString` du
 * fichier, avec leurs arguments — découpés par comptage de parenthèses, un
 * motif non gourmand s'arrêterait à la première parenthèse imbriquée venue.
 */
const appelsToLocale = (source: string): { texte: string; ligne: number }[] => {
  const out: { texte: string; ligne: number }[] = [];
  const ouvrant = /\.toLocale(?:Date|Time)?String\(/g;
  let m: RegExpExecArray | null;

  while ((m = ouvrant.exec(source)) !== null) {
    let profondeur = 0;
    let fin = m.index + m[0].length - 1;
    for (let i = fin; i < source.length; i += 1) {
      if (source[i] === "(") profondeur += 1;
      else if (source[i] === ")") {
        profondeur -= 1;
        if (profondeur === 0) {
          fin = i;
          break;
        }
      }
    }
    out.push({
      texte: source.slice(m.index, fin + 1),
      ligne: source.slice(0, m.index).split("\n").length,
    });
  }
  return out;
};

describe("aucune date destinée à un e-mail n'est formatée sans fuseau", () => {
  it("chaque toLocale…String de ces modules précise timeZone", () => {
    const coupables: string[] = [];

    for (const racine of SOURCES_A_RELIRE) {
      for (const fichier of fichiersTs(racine)) {
        const source = readFileSync(fichier, "utf-8");
        for (const appel of appelsToLocale(source)) {
          if (/timeZone\s*:/.test(appel.texte)) continue;
          coupables.push(`${fichier}:${appel.ligne} — ${appel.texte.split("\n")[0]}…`);
        }
      }
    }

    expect(coupables).toEqual([]);
  });
});
