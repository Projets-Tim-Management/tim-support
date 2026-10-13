#!/usr/bin/env node
/**
 * Pose le code NAF des fiches qui ont un SIREN ou un SIRET mais pas encore de
 * métier, d'après l'INSEE.
 *
 *   npx tsx scripts/naf-recalcul.ts              # à blanc : rapport, rien n'est écrit
 *   npx tsx scripts/naf-recalcul.ts --appliquer  # écrit les codes trouvés
 *
 * N'écrase JAMAIS un code déjà présent, quelle que soit sa source — donc
 * jamais une saisie manuelle. Le SIRET prime quand il est là (l'activité de
 * l'établissement facturé), sinon le SIREN (celle de l'unité légale).
 *
 * L'API Sirene accepte 30 requêtes par minute : une requête toutes les 2,1 s.
 * Chaque écriture est un enregistrement ordinaire de la fiche (hooks compris,
 * source « insee »), dans l'état où elle est : un brouillon reste brouillon.
 *
 * Chantier NAF, N2 (docs/PLAN-PUBLICITE.md).
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
const { inseeSearch, isInseeConfigured } = await import("@/modules/partner/lib/insee");
const { nafLabel } = await import("@/modules/partner/lib/naf");

if (!isInseeConfigured()) {
  console.error("INSEE_API_KEY absente de .env.local : rien n'est fait.");
  process.exit(1);
}

const apply = process.argv.includes("--appliquer");
const payload = await getPayload({ config });

type Client = {
  id: number;
  companyName?: string | null;
  siren?: string | null;
  siret?: string | null;
  naf?: string | null;
  _status?: "draft" | "published" | null;
};

const { docs } = await payload.find({
  collection: "partner-clients",
  limit: 5000,
  depth: 0,
  draft: true,
  overrideAccess: true,
  pagination: false,
});

const digits = (v?: string | null) => (v ?? "").replace(/\s/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const found: { c: Client; naf: string; by: string }[] = [];
const missing: { c: Client; why: string }[] = [];
let alreadySet = 0;
let noId = 0;

const todo = (docs as unknown as Client[]).filter((c) => {
  if (c.naf) {
    alreadySet++;
    return false;
  }
  const siret = digits(c.siret);
  const siren = digits(c.siren);
  if (!/^\d{14}$/.test(siret) && !/^\d{9}$/.test(siren)) {
    noId++;
    return false;
  }
  return true;
});

console.log(`${docs.length} fiches · ${todo.length} à interroger (≈ ${Math.ceil((todo.length * 2.1) / 60)} min)\n`);

for (const [i, c] of todo.entries()) {
  if (i > 0) await sleep(2100);
  const siret = digits(c.siret);
  const by = /^\d{14}$/.test(siret) ? `SIRET ${siret}` : `SIREN ${digits(c.siren)}`;
  const res = await inseeSearch(by.split(" ")[1]);
  if (res === null) missing.push({ c, why: `${by} : INSEE injoignable ou refus` });
  else if (!res.length) missing.push({ c, why: `${by} : inconnu de l'INSEE` });
  else if (!res[0].naf) missing.push({ c, why: `${by} : pas d'activité en NAF rév. 2` });
  else found.push({ c, naf: res[0].naf, by });
}

const name = (c: Client) => `#${c.id} ${c.companyName ?? "—"}`;

console.log(`Trouvées (${found.length})`);
for (const f of found) console.log(`  ${name(f.c)} — ${f.by} → ${f.naf} ${nafLabel(f.naf)}`);
console.log(`\nIntrouvables (${missing.length})`);
for (const m of missing) console.log(`  ${name(m.c)} — ${m.why}`);
console.log(`\nIgnorées : ${alreadySet} déjà remplies, ${noId} sans SIREN ni SIRET`);

if (!apply) {
  console.log("\nÀ blanc : rien n'a été écrit. Relancer avec --appliquer pour écrire.");
  process.exit(0);
}

let written = 0;
for (const f of found) {
  // Relue juste avant l'écriture : un code posé entre-temps à la main gagne.
  const fresh = (await payload.findByID({
    collection: "partner-clients",
    id: f.c.id,
    depth: 0,
    draft: true,
    overrideAccess: true,
  })) as unknown as Client;
  if (fresh.naf) continue;
  await payload.update({
    collection: "partner-clients",
    id: f.c.id,
    data: { naf: f.naf, nafSource: "insee" },
    draft: fresh._status === "draft",
    depth: 0,
    overrideAccess: true,
  });
  written++;
}
console.log(`\n${written} fiche(s) écrite(s).`);
process.exit(0);
