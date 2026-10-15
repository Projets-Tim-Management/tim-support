/**
 * Vérifie le format des envois à GA4 (plan de mesure, phase 2.2) auprès de
 * l'endpoint de DEBUG du Measurement Protocol : GA4 valide les deux événements
 * (`qualify_lead`, `close_convert_lead`) et renvoie ses messages, sans rien
 * enregistrer dans les rapports. Aucune base, aucune opportunité touchée.
 *
 *   GA4_MEASUREMENT_ID=G-… GA4_API_SECRET=… npx tsx scripts/ga4-mp-debug.ts
 *
 * (ou les deux variables dans .env.local). La clé n'est jamais affichée.
 * « validationMessages: [] » pour chaque événement = format accepté.
 */
import { existsSync, readFileSync } from "node:fs";

import { ga4Body, sendGa4, type Ga4Lead } from "@/modules/analytics/lib/ga4-mp";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*(GA4_[A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const lead: Ga4Lead = { gaClientId: "1234567890.1700000000", gaSessionId: "1760345678", formId: "demo", channel: "google-ads", sourcePagePath: "/produits/pointage", landingPath: "/lp/demande-demo" };

for (const [step, value] of [["qualify", null], ["close", 1490]] as const) {
  const body = ga4Body(step, lead, value)!;
  try {
    const r = await sendGa4(body, {}, true);
    console.log(`${step} →`, JSON.stringify(r));
  } catch (e) {
    console.error(`${step} : ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
