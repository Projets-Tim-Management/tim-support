#!/usr/bin/env node
/**
 * Reprise du 28/09/2026 : les phases de test OUVERTES passent au nouveau
 * découpage — le test s'arrête à « Décision du client », la suite vit dans le
 * parcours « Mise en production ».
 *
 *   npx tsx scripts/test-vers-production.ts             # constate, ne change rien
 *   npx tsx scripts/test-vers-production.ts --appliquer # applique
 *
 * Pour chaque phase de test ouverte (préparation / en cours) :
 *  1. les anciennes étapes de sortie (devis, demande de contrat, contrat,
 *     signature, mise en production) sont RETIRÉES, même faites ;
 *  2. ce qu'elles prouvaient est reporté sur la fiche, où vivent désormais les
 *     faits : « Devis transmis » fait → « Devis envoyé le » ; « Contrat signé »
 *     fait → date de signature (jamais d'écrasement d'une date déjà posée) ;
 *  3. décision « contrat » : l'étape « Décision du client » est validée — les
 *     hooks clôturent le test (gagné), passent la fiche « En signature » et
 *     ouvrent la mise en production, dont les étapes déjà acquises sur la
 *     fiche se cochent seules.
 *
 * Passe par l'API Payload (hooks compris), sans utilisateur : les garde-fous
 * réservés aux humains (structure, étapes datées) ne s'appliquent pas.
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
const { PHASE_DE_TEST_STEPS, PRODUCTION_KEY, STEP_TEST_WON } = await import("@/modules/marketing/lib/journey");

const apply = process.argv.includes("--appliquer");
const payload = await getPayload({ config });

type Step = { key?: string; label?: string; state?: string; doneAt?: string | null };
type Run = {
  id: number;
  client?: number | { id: number };
  journeyKey?: string | null;
  status?: string;
  decision?: string | null;
  displayName?: string | null;
  steps?: Step[];
};

const TEST_KEYS = new Set(PHASE_DE_TEST_STEPS.map((s) => s.key));
const idOf = (v: unknown) => (v && typeof v === "object" ? (v as { id: number }).id : (v as number));

const runs = (
  await payload.find({
    collection: "journey-runs",
    where: { status: { in: ["preparation", "en-cours"] } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
).docs as unknown as Run[];

const tests = runs.filter((r) => r.journeyKey !== PRODUCTION_KEY);
console.log(`${tests.length} phase(s) de test ouverte(s)${apply ? "" : " — CONSTAT, rien n'est écrit"}\n`);

for (const run of tests) {
  const clientId = idOf(run.client);
  const client = (await payload.findByID({
    collection: "partner-clients",
    id: clientId,
    depth: 0,
    overrideAccess: true,
  })) as unknown as Record<string, unknown>;
  const steps = run.steps ?? [];
  const removed = steps.filter((s) => s.key && !TEST_KEYS.has(s.key));
  const kept = steps.filter((s) => !(s.key && !TEST_KEYS.has(s.key)));
  const doneAt = (key: string) => {
    const s = removed.find((x) => x.key === key);
    return s && (s.state === "fait" || s.state === "auto") ? (s.doneAt ?? new Date().toISOString()) : null;
  };

  // Faits à reporter sur la fiche (jamais par-dessus une date existante).
  const facts: Record<string, string> = {};
  const devis = doneAt("devis");
  if (devis && !client.quoteSentAt) facts.quoteSentAt = devis;
  const signature = doneAt("signature");
  if (signature && !client.signatureDate) facts.signatureDate = signature;

  const toProduction = run.decision === "contrat";
  const name = String(client.companyName ?? run.displayName ?? `parcours ${run.id}`);
  console.log(
    `• ${name} (parcours ${run.id}, ${run.status}, décision : ${run.decision ?? "—"})\n` +
      `    étapes retirées : ${removed.length ? removed.map((s) => `${s.key}${s.state === "fait" ? " ✓" : ""}`).join(", ") : "aucune"}\n` +
      `    reporté sur la fiche : ${Object.keys(facts).length ? JSON.stringify(facts) : "rien"}\n` +
      `    → ${toProduction ? "clôture du test, fiche « En signature », mise en production ouverte" : "reste en phase de test"}`,
  );
  if (!apply) continue;

  try {
    if (Object.keys(facts).length) {
      await payload.update({ collection: "partner-clients", id: clientId, data: facts as never, overrideAccess: true });
    }
    const now = new Date().toISOString();
    await payload.update({
      collection: "journey-runs",
      id: run.id,
      data: {
        steps: toProduction
          ? kept.map((s) => (s.key === STEP_TEST_WON && s.state !== "fait" ? { ...s, state: "fait", doneAt: now } : s))
          : kept,
      } as never,
      overrideAccess: true,
    });
    const after = (await payload.find({
      collection: "journey-runs",
      where: { client: { equals: clientId } },
      sort: "-createdAt",
      limit: 2,
      depth: 0,
      overrideAccess: true,
    })).docs as unknown as Run[];
    const fresh = (await payload.findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true })) as unknown as { clientStatus?: string };
    console.log(
      `    ✅ fiche : ${fresh.clientStatus} · parcours : ${after.map((r) => `${r.id} ${r.journeyKey} ${r.status}`).join(" | ")}`,
    );
  } catch (err) {
    console.log(`    ❌ échec : ${err}`);
  }
}

process.exit(0);
