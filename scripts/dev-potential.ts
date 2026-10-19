/**
 * Recalcule le potentiel de tous les développements (le % de signature du
 * demandeur le plus chaud) — ce que fait la tâche de nuit dev-potential.
 * Utile juste après la migration, ou pour vérifier un barème.
 *
 *   npx tsx scripts/dev-potential.ts
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
const { refreshPotentials } = await import("@/modules/dev/lib/potential");

const payload = await getPayload({ config });
const count = await refreshPotentials(payload);
console.log(`${count} développement(s) recalculé(s).`);
process.exit(0);
