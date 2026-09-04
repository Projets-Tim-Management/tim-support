#!/usr/bin/env node
/**
 * État des séquences de relance, et ce qui partirait maintenant.
 *
 *   npx tsx scripts/sequences-status.ts
 *
 * Deux questions, une réponse : comment les modèles sont réglés, et ce que le
 * passage quotidien enverrait s'il tournait à l'instant. Le passage est fait
 * À BLANC — `dry: true` : rien n'est envoyé, rien n'est marqué, rien n'est
 * enrôlé. C'est la vérification à faire avant un déploiement, parce qu'un test
 * unitaire ne dit rien de ce que contient la base.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Charge .env.local dans process.env (dotenv n'est pas installé ici). */
for (const line of readFileSync(join(projectDir, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const { getPayload } = await import("payload");
const { default: config } = await import("@payload-config");
const { sendDueSequenceMessages } = await import("@/modules/marketing/lib/sequence-send");

const payload = await getPayload({ config });

const models = await payload.find({ collection: "sequences", depth: 1, limit: 20, overrideAccess: true });

console.log("\n── MODÈLES ─────────────────────────────────────────────────────");
for (const doc of models.docs as unknown as Record<string, unknown>[]) {
  const next = doc.nextSequence as { label?: string } | null;
  console.log(
    `  ${String(doc.label).padEnd(14)}` +
      ` ${doc.active ? "ACTIVE  " : "inactive"}` +
      ` · réponse ${doc.stopOnReply === false ? "n'arrête pas" : "arrête     "}` +
      ` · ${(doc.messages as unknown[])?.length ?? 0} msg` +
      ` · enchaîne sur ${next?.label ?? "—"}` +
      ` · ${doc.fromEmail ?? "adresse par défaut"}`,
  );
  const reasons = (doc.lossReasons as string[]) ?? [];
  console.log(`  ${" ".repeat(14)} motifs : ${reasons.join(", ") || "aucun (ne s'ouvre jamais seule)"}`);
}

const runs = await payload.find({
  collection: "sequence-runs",
  limit: 200,
  depth: 0,
  overrideAccess: true,
});
const byStatus: Record<string, number> = {};
for (const r of runs.docs as { status?: string }[]) byStatus[r.status ?? "?"] = (byStatus[r.status ?? "?"] ?? 0) + 1;
const suppressions = await payload.count({ collection: "email-suppressions", overrideAccess: true });

console.log("\n── EN COURS ────────────────────────────────────────────────────");
console.log(`  séquences : ${runs.totalDocs} (${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(", ") || "aucune"})`);
console.log(`  adresses désinscrites : ${suppressions.totalDocs}`);

const summary = await sendDueSequenceMessages(payload, { dry: true });
console.log("\n── PASSAGE À BLANC (aucun envoi) ───────────────────────────────");
console.log(`  examinées : ${summary.runs}`);
console.log(`  partiraient : ${summary.sent.length ? summary.sent.join(", ") : "aucun message dû"}`);
if (summary.unsubscribed.length) console.log(`  à arrêter (désinscrites) : ${summary.unsubscribed.join(", ")}`);
if (summary.failed.length) console.log(`  ⚠️  en échec : ${summary.failed.join(", ")}`);

console.log("");
process.exit(0);
