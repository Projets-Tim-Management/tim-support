#!/usr/bin/env node
/**
 * Importer les factures Axonaut (PDF) dans « axonaut-invoices » — l'historique
 * d'avant Pennylane lu par « Analyses → Facturation ».
 *
 *   npx tsx scripts/import-axonaut.ts <dossier des PDF>            # simulation : rien n'est écrit
 *   npx tsx scripts/import-axonaut.ts <dossier des PDF> --ecrire   # importe (remplace un numéro déjà là)
 *
 * Il faut `pdftotext` (poppler). La simulation affiche les totaux par mois,
 * les numéros manquants, et le rattachement de chaque client à sa fiche ;
 * une facture sans fiche est importée quand même, son nom suffit à l'analyse.
 * Seules les factures de TIM entrent : celles de DELIGUME (même compte
 * Axonaut, 2019–2022) sont écartées et comptées à part.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(join(projectDir, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const dir = process.argv[2];
const write = process.argv.includes("--ecrire");
if (!dir) {
  console.error("Usage : npx tsx scripts/import-axonaut.ts <dossier des PDF> [--ecrire]");
  process.exit(1);
}

const { getPayload } = await import("payload");
const { default: config } = await import("@payload-config");
const { isTimInvoice, parseAxonaut, withCorrections, matchAll } = await import("@/modules/analytics/lib/axonaut");

const files = readdirSync(resolve(dir))
  .filter((f) => f.toLowerCase().endsWith(".pdf"))
  .sort();
const skipped: string[] = [];
const unreadable: string[] = [];
const docs = files.flatMap((f) => {
  let text: string;
  try {
    text = execFileSync("pdftotext", ["-layout", join(resolve(dir), f), "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    unreadable.push(f); // PDF abîmé : signalé, pas importé
    return [];
  }
  if (!isTimInvoice(text)) {
    skipped.push(f);
    return [];
  }
  try {
    return [{ ...withCorrections(parseAxonaut(text)), sourceFile: f }];
  } catch (e) {
    throw new Error(`${f} : ${(e as Error).message}`);
  }
});

const payload = await getPayload({ config });
const clients = await payload.find({
  collection: "partner-clients",
  pagination: false,
  depth: 0,
  draft: true,
  overrideAccess: true,
  select: { companyName: true, raisonSociale: true, siren: true } as never,
});
const matches = matchAll(docs, clients.docs as never);
const nameOf = new Map((clients.docs as { id: number; companyName?: string }[]).map((c) => [String(c.id), c.companyName ?? "—"]));

/* ── Ce qui va être importé ── */
const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
console.log(`${docs.length} factures TIM lues dans ${basename(resolve(dir))}`);
if (skipped.length) console.log(`${skipped.length} PDF écartés (pas TIM : DELIGUME) — de ${skipped[0]} à ${skipped.at(-1)}`);
if (unreadable.length) console.log(`${unreadable.length} PDF illisibles (abîmés) : ${unreadable.join(", ")}`);
console.log("");

const byMonth = new Map<string, { total: number; recurring: number; services: number; n: number }>();
for (const d of docs) {
  const m = byMonth.get(d.month) ?? { total: 0, recurring: 0, services: 0, n: 0 };
  m.total += d.totalHT;
  m.recurring += d.recurringHT;
  m.services += d.servicesHT;
  m.n += 1;
  byMonth.set(d.month, m);
}
console.log("Mois      Factures   Total PDF HT    Licences HT   Prestations HT");
for (const [k, m] of [...byMonth].sort()) console.log(`${k}   ${String(m.n).padStart(5)}   ${eur(m.total).padStart(12)}   ${eur(m.recurring).padStart(12)}   ${eur(m.services).padStart(12)}`);

const seqByYear = new Map<string, number[]>();
for (const d of docs) seqByYear.set(d.number.slice(1, 5), [...(seqByYear.get(d.number.slice(1, 5)) ?? []), Number(d.number.split("-")[1])]);
for (const [y, s] of seqByYear) {
  const missing: number[] = [];
  for (let i = Math.min(...s); i <= Math.max(...s); i++) if (!s.includes(i)) missing.push(i);
  console.log(`\n${y} : n° ${Math.min(...s)} à ${Math.max(...s)}${missing.length ? ` — manquants : ${missing.join(", ")}` : " — aucun manquant"}`);
}

console.log("\nRattachement aux fiches :");
const seen = new Set<string>();
for (const d of docs) {
  if (seen.has(d.clientName)) continue;
  seen.add(d.clientName);
  const m = matches.get(d.number);
  console.log(`  ${d.clientName.padEnd(45)} → ${m ? `fiche n° ${m.id} « ${nameOf.get(String(m.id))} » (par ${m.by})` : "AUCUNE FICHE"}`);
}
const corrected = docs.filter((d) => d.note);
if (corrected.length) console.log(`\n${corrected.length} facture(s) corrigée(s) : ${corrected.map((d) => d.number).join(", ")}`);

if (!write) {
  console.log("\nSimulation : rien n'est écrit. Relancer avec --ecrire pour importer.");
  process.exit(0);
}

/* ── Import : un numéro = une ligne, remplacée si elle existe ── */
let created = 0;
let updated = 0;
for (const d of docs) {
  const data = {
    number: d.number,
    kind: d.kind,
    date: `${d.date}T12:00:00.000Z`,
    month: d.month,
    client: matches.get(d.number)?.id ?? null,
    clientName: d.clientName,
    siren: d.siren,
    totalHT: d.totalHT,
    totalTTC: d.totalTTC,
    recurringHT: d.recurringHT,
    servicesHT: d.servicesHT,
    creditFor: d.creditFor,
    note: d.note,
    lines: d.lines,
    sourceFile: d.sourceFile,
  };
  const existing = await payload.find({ collection: "axonaut-invoices", where: { number: { equals: d.number } }, limit: 1, depth: 0, overrideAccess: true });
  if (existing.docs[0]) {
    await payload.update({ collection: "axonaut-invoices", id: existing.docs[0].id, data: data as never, overrideAccess: true });
    updated++;
  } else {
    await payload.create({ collection: "axonaut-invoices", data: data as never, overrideAccess: true });
    created++;
  }
}
console.log(`\nImporté : ${created} créée(s), ${updated} mise(s) à jour.`);
process.exit(0);
