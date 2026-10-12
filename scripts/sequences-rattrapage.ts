#!/usr/bin/env node
/**
 * Ouvre une séquence pour les opportunités « Perdue » qui n'en ont JAMAIS eu.
 *
 *   npx tsx scripts/sequences-rattrapage.ts                       # constate, ne change rien
 *   npx tsx scripts/sequences-rattrapage.ts --appliquer           # ouvre les séquences
 *   npx tsx scripts/sequences-rattrapage.ts --par-jour=15         # rythme (12 par défaut)
 *
 * L'enrôlement automatique ne se déclenche qu'à l'ENTRÉE dans « Perdue » : le
 * stock passé en « Perdue » avant la mise en service, ou importé directement
 * dans ce statut (reprise Brevo), n'a rien reçu. Ce script le rattrape avec
 * les mêmes garde-fous (`enrollInSequence` : adresse désinscrite, séquence
 * déjà en cours) et la même règle motif → séquence.
 *
 * Une fiche qui a déjà eu une séquence, terminée ou arrêtée, est laissée de
 * côté : on ne relance pas quelqu'un qui a répondu ou s'est désinscrit.
 *
 * Les départs sont ÉTALÉS : `--par-jour` fiches par jour, à partir
 * d'aujourd'hui. Cent premiers e-mails le même jour vers d'anciens contacts,
 * c'est le meilleur moyen d'abîmer la réputation de l'expéditeur.
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
const { besoinsOf, enrollInSequence } = await import("@/modules/marketing/lib/enroll");
const { sequenceForLossReason } = await import("@/modules/marketing/lib/sequences");
type SequenceDoc = import("@/modules/marketing/lib/sequences").SequenceDoc;

const apply = process.argv.includes("--appliquer");
const perDay = Math.max(1, Number(process.argv.find((a) => a.startsWith("--par-jour="))?.split("=")[1]) || 12);
const payload = await getPayload({ config });

const models = (
  await payload.find({ collection: "sequences", where: { active: { equals: true } }, limit: 20, depth: 0, overrideAccess: true })
).docs as SequenceDoc[];

// `draft: true` : la reprise Brevo a créé ces fiches en brouillon.
const lost = (
  await payload.find({
    collection: "partner-clients",
    where: { clientStatus: { equals: "perdue" } },
    limit: 5000,
    depth: 0,
    draft: true,
    overrideAccess: true,
    sort: "-updatedAt",
  })
).docs as unknown as { id: number; email?: string; lossReason?: string; formSubmission?: unknown }[];

const runs = await payload.find({ collection: "sequence-runs", limit: 10000, depth: 0, overrideAccess: true });
const everEnrolled = new Set(
  runs.docs.map((r) => {
    const c = (r as { client?: unknown }).client;
    return String(c && typeof c === "object" ? (c as { id?: unknown }).id : c);
  }),
);

const todo = lost.filter((c) => !everEnrolled.has(String(c.id)));
console.log(`${lost.length} fiches « Perdue », ${todo.length} jamais enrôlées — ${perDay} par jour.\n`);

const now = Date.now();
const perSequence = new Map<string, number>();
const refused: string[] = [];
let slot = 0;

for (const c of todo) {
  const email = String(c.email ?? "").trim().toLowerCase();
  const sequence = sequenceForLossReason(models, c.lossReason);
  if (!email || !sequence) {
    refused.push(`#${c.id} ${email || "(sans e-mail)"} : ${!email ? "aucune adresse" : `aucune séquence pour « ${c.lossReason ?? "—"} »`}`);
    continue;
  }

  const startedAt = new Date(now + Math.floor(slot / perDay) * 86_400_000);
  const day = startedAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

  if (apply) {
    const refus = await enrollInSequence(payload, {
      clientId: c.id,
      email,
      sequence,
      besoins: await besoinsOf(payload, c.formSubmission),
      startedAt,
    });
    if (refus) {
      refused.push(`#${c.id} ${email} : ${refus}`);
      continue;
    }
  }

  slot++;
  perSequence.set(sequence.label ?? "?", (perSequence.get(sequence.label ?? "?") ?? 0) + 1);
  console.log(`${apply ? "✓" : "·"} ${day}  #${c.id} ${email} → ${sequence.label} (${c.lossReason})`);
}

console.log(`\n${apply ? "Ouvertes" : "À ouvrir"} : ${slot}`);
for (const [label, n] of perSequence) console.log(`  ${label} : ${n}`);
if (refused.length) {
  console.log(`\nLaissées de côté : ${refused.length}`);
  for (const r of refused) console.log(`  ${r}`);
}
if (!apply) console.log("\nRien n'a été modifié. Relancer avec --appliquer pour ouvrir les séquences.");

process.exit(0);
