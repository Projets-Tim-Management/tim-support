#!/usr/bin/env node
/**
 * Contrôle de facturation en ligne de commande — le même rapport que l'écran
 * /admin/facturation, dans le terminal.
 *
 *   npx tsx scripts/facturation-check.ts          # les fiches à traiter
 *   npx tsx scripts/facturation-check.ts --tout   # toutes, conformes comprises
 *
 * Ne modifie rien : ni le support, ni Pennylane. Il faut PENNYLANE_API_TOKEN
 * dans .env.local.
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
const { loadBillingReport } = await import("@/modules/partner/lib/billing-report");
const { plStatusLabel } = await import("@/modules/partner/lib/billing-check");

const all = process.argv.includes("--tout");
const payload = await getPayload({ config });

const report = await loadBillingReport(payload);
const { summary } = report;

console.log(
  `${summary.total} fiches contrôlées · ${summary.ok} conformes · ${summary.ecart} écarts · ` +
    `${summary.sansAbonnement + summary.nonRapproche} sans abonnement · ${summary.orphans} facturés sans fiche · ` +
    `${summary.latePayments} paiement(s) en retard (${summary.lateAmount} € TTC)\n`,
);

for (const c of report.checks) {
  if (!all && c.verdict === "ok") continue;
  const pl = c.pennylane;
  const state = pl?.subscriptionId ? plStatusLabel(pl.status) : pl ? "aucun abonnement" : "absent de Pennylane";
  console.log(`[${c.verdict.toUpperCase()}] ${c.client.name} — ${state} · fiche ${c.totals.supportHT} € HT → Pennylane ${c.totals.plHT} € HT`);
  for (const i of c.issues) console.log(`   ${i.severity === "error" ? "✗" : "△"} ${i.label}`);
}

if (report.orphans.length) {
  console.log("\nFacturés par Pennylane sans fiche « Gagnée » :");
  for (const o of report.orphans) {
    console.log(`   ${o.customerName}${o.regNo ? ` (${o.regNo})` : ""} — ${plStatusLabel(o.status)} · ${o.amountHT} € HT / mois`);
  }
}

process.exit(0);
