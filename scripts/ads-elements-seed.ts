#!/usr/bin/env node
/**
 * Crée les éléments de motion design de départ dans Publicité › Éléments
 * (atelier des éléments) : un par élément de base, actif, avec ses réglages
 * par défaut. Leur aperçu se rend ensuite au fil du cron des vidéos.
 *
 *   npx tsx scripts/ads-elements-seed.ts
 *
 * Idempotent : un élément déjà présent sous le même nom n'est ni recréé ni
 * modifié — une amélioration faite dans l'atelier n'est jamais écrasée.
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
const { baseElements } = await import("@/modules/ads/lib/element-atelier");
const payload = await getPayload({ config });

let made = 0;
for (const e of baseElements()) {
  const exists = await payload.count({ collection: "ad-elements", where: { name: { equals: e.name } }, overrideAccess: true });
  if (exists.totalDocs) continue;
  await payload.create({ collection: "ad-elements", data: { ...e, versionNote: "Élément de départ" } as never, overrideAccess: true });
  made++;
}
console.log(`${made} élément(s) créé(s), ${baseElements().length - made} déjà présent(s).`);
process.exit(0);
