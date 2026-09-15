#!/usr/bin/env node
/**
 * Recale l'historique mensuel de TOUTES les fiches sur les règles actuelles
 * (modules/partner/lib/history.ts) : rien pour les prospects, une première
 * ligne au mois de démarrage de la facturation (abonnement Pennylane, sinon
 * contrat) pour les clients gagnés, jamais avant.
 *
 *   npx tsx scripts/historique-recaler.ts             # constate, ne change rien
 *   npx tsx scripts/historique-recaler.ts --appliquer # ré-enregistre les fiches à recaler
 *
 * Le hook `computeCA` fait le travail : on ré-enregistre chaque fiche dont
 * l'historique changerait, sans rien modifier d'autre. Pennylane est lu une
 * fois avant, pour que les dates de démarrage soient connues.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(join(projectDir, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const { getPayload } = await import("payload");
const { default: config } = await import("@payload-config");
const { loadPennylane } = await import("@/modules/partner/lib/pennylane");
const { pennylaneStampFor } = await import("@/modules/partner/lib/billing-check");
const { nextHistory, detailSignature } = await import("@/modules/partner/lib/history");

const apply = process.argv.includes("--appliquer");
const payload = await getPayload({ config });

const snap = await loadPennylane();
const clients = await payload.find({ collection: "partner-clients", limit: 5000, depth: 0, draft: true, overrideAccess: true });

type Entry = { at?: string; totalLicences?: number; detail?: unknown };
const describe = (h: Entry[]) => (h.length ? h.map((e) => `${e.at?.slice(0, 7)}→${e.totalLicences ?? 0}`).join(" ") : "∅");

let toFix = 0;
for (const c of clients.docs as unknown as Record<string, unknown>[]) {
  const prev = (Array.isArray(c.history) ? c.history : []) as Entry[];
  const stamp = pennylaneStampFor(
    {
      id: c.id as number,
      name: String(c.companyName ?? ""),
      siren: c.siren as string | null,
      raisonSociale: c.raisonSociale as string | null,
      clientStatus: c.clientStatus as string | null,
      licences: c.licences as Record<string, number> | null,
    },
    snap,
  );
  const billingStart = stamp.start ?? (c.contractStartDate as string | null) ?? null;
  const last = prev[prev.length - 1];
  // Même config que la dernière ligne : le recalage ne fait que déplacer / retirer.
  const next = nextHistory(prev, {
    clientStatus: c.clientStatus as string | null,
    billingStart,
    now: new Date(),
    entry: { totalLicences: last?.totalLicences, detail: last?.detail },
    stamp,
    freshStamp: true,
  });
  const same =
    next.length === prev.length &&
    next.every((e, i) => e.at === prev[i]?.at && detailSignature(e.detail) === detailSignature(prev[i]?.detail));
  if (same) continue;
  toFix += 1;
  console.log(`${c.companyName} [${c.clientStatus}] démarrage ${billingStart ?? "inconnu"}\n   avant : ${describe(prev)}\n   après : ${describe(next)}`);
  if (apply) {
    await payload.update({ collection: "partner-clients", id: c.id as number, data: {}, depth: 0, overrideAccess: true });
  }
}

console.log(`\n${toFix} fiche(s) à recaler${apply ? " — ré-enregistrées." : ". Relancer avec --appliquer pour le faire."}`);
process.exit(0);
