#!/usr/bin/env node
/**
 * Verse les styles de la planche du 14/10/2026 (A, B, C) dans Publicité ›
 * Paramètres › Styles (plan Publicité, §9 sexies, D2b).
 *
 *   npx tsx scripts/ads-styles-seed.ts
 *
 * Idempotent : un style déjà présent sous le même nom n'est ni recréé ni
 * modifié — une retouche faite par Charlie n'est jamais écrasée.
 *
 * Pourquoi un script et pas la migration : scripts/db-migrate.mjs n'exécute que
 * le SQL des migrations, pas leur code.
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
const { PLANCHE_STYLES } = await import("@/modules/ads/collections/AdStyles");
const payload = await getPayload({ config });

for (const style of PLANCHE_STYLES) {
  const known = await payload.count({ collection: "ad-styles", where: { name: { equals: style.name } }, overrideAccess: true });
  if (known.totalDocs) {
    console.log(`déjà là : ${style.name}`);
    continue;
  }
  await payload.create({ collection: "ad-styles", data: { ...style, graphics: [...style.graphics], transitions: [...style.transitions] } as never, overrideAccess: true });
  console.log(`ajouté : ${style.name}`);
}
process.exit(0);
