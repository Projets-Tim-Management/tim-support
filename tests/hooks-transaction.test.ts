import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Une écriture faite DEPUIS un hook doit rejoindre la transaction en cours.
 *
 * Payload ouvre une transaction par requête. Un hook qui appelle
 * `payload.update()` sans lui passer `req` en sort : il lit un état périmé — la
 * modification qui l'a déclenché n'est pas encore commitée — et surtout, il
 * tente d'écrire des lignes que cette même transaction verrouille encore.
 *
 * Quand les deux écritures se croisent (le parcours met le client à jour, le
 * client réarme une étape du parcours), c'est un interblocage : la requête
 * tourne jusqu'au délai, puis TOUT est annulé. Côté utilisateur, un bouton qui
 * tourne dans le vide et un enregistrement qui n'a jamais eu lieu.
 *
 * C'est arrivé le 24/08/2026 sur « Dossier vérifié par TIM » — un `req` oublié
 * dans un hook, alors que les onze autres du même fichier le passaient.
 *
 * Ce test lit le code plutôt que de l'exécuter : reproduire un interblocage
 * demanderait une vraie base et deux transactions concurrentes, là où l'oubli se
 * voit à l'œil nu. Il attrape la faute d'inattention, qui est le vrai risque.
 */

const ROOTS = ["modules/marketing/collections", "modules/partner/collections", "core/collections"];

/** Fichiers de collection, en écartant les doublons du type « Fichier 2.ts ». */
const collectionFiles = (): string[] => {
  const out: string[] = [];
  for (const root of ROOTS) {
    let names: string[];
    try {
      names = readdirSync(root);
    } catch {
      continue; // dossier absent : rien à vérifier
    }
    for (const name of names) {
      if (!name.endsWith(".ts") || / \d+\.ts$/.test(name)) continue;
      out.push(join(root, name));
    }
  }
  return out;
};

/**
 * Appels `payload.<create|update|delete>({ … })` du fichier, avec leur contenu.
 *
 * Découpage par comptage d'accolades plutôt que par expression régulière : un
 * appel contient des objets imbriqués (`data`, `where`), et un motif non
 * gourmand s'arrêterait à la première accolade fermante venue.
 */
const writeCalls = (source: string): { method: string; body: string; line: number }[] => {
  const calls: { method: string; body: string; line: number }[] = [];
  const opener = /payload\.(create|update|delete)\(\{/g;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(source)) !== null) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (let i = end; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    calls.push({
      method: match[1],
      body: source.slice(match.index, end + 1),
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return calls;
};

describe("les écritures faites depuis un hook rejoignent la transaction", () => {
  it("chaque payload.create/update/delete d'une collection passe `req`", () => {
    const coupables: string[] = [];

    for (const file of collectionFiles()) {
      const source = readFileSync(file, "utf-8");
      for (const call of writeCalls(source)) {
        // `req,` en raccourci, `req:` en toutes lettres, ou `req.transactionID`.
        if (/\breq\s*[,:]/.test(call.body)) continue;
        coupables.push(`${file}:${call.line} — payload.${call.method} sans req`);
      }
    }

    expect(coupables).toEqual([]);
  });

  it("armAutoStep reçoit `req` partout où il est appelé depuis un hook", () => {
    const coupables: string[] = [];

    for (const file of collectionFiles()) {
      const source = readFileSync(file, "utf-8");
      const appels = source.match(/armAutoStep\([^)]*\)/g) ?? [];
      for (const appel of appels) {
        if (/,\s*req\s*\)/.test(appel)) continue;
        coupables.push(`${file} — ${appel}`);
      }
    }

    expect(coupables).toEqual([]);
  });
});
