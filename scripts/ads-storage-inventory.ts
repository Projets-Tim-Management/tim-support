/**
 * Inventaire (et ménage) du stockage des pubs — temps 3 du retrait de l'ancien
 * moteur vidéo (19/10/2026). Chaque fichier « ads/ » est classé :
 *   - utile : ce que le support sert aujourd'hui (fichiers importés des créas,
 *     rushes d'origine, logos et polices du kit) ;
 *   - ancien : seulement cité par l'ancien moteur (vidéos rendues, aperçus,
 *     retouches, inspirations, versions de travail des rushes, musiques, visages,
 *     visuels rendus des anciennes créas) ;
 *   - orphelin : plus rien en base ne pointe dessus ;
 *   - zip : téléchargements temporaires.
 *
 *   npx tsx scripts/ads-storage-inventory.ts            # à blanc : compte, ne supprime rien
 *   npx tsx scripts/ads-storage-inventory.ts --supprimer # supprime « ancien », « orphelin » et « zip »
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

const apply = process.argv.includes("--supprimer");
const { getPayload } = await import("payload");
const { default: config } = await import("@payload-config");
const { sql } = await import("@payloadcms/db-postgres");
const { execSql, rowsOf } = await import("@/core/lib/raw-sql");
const { normUrl, urlsIn } = await import("@/modules/ads/lib/storage-cleanup");
const { list, del } = await import("@vercel/blob");

const payload = await getPayload({ config });
const token = process.env.BLOB_READ_WRITE_TOKEN;

const col = async (q: ReturnType<typeof sql>) => (rowsOf(await execSql(payload, q)) as { u: string | null }[]).map((r) => r.u).filter((u): u is string => Boolean(u)).map(normUrl);
const useful = new Set([
  ...(await col(sql`SELECT "url" AS u FROM "ad_creatives_files"`)),
  ...(await col(sql`SELECT "original_url" AS u FROM "ad_rushes"`)),
  ...(await col(sql`SELECT "url" AS u FROM "ad_media" WHERE "kind" IN ('logo', 'police')`)),
]);
const anywhere = new Set<string>();
const tables = (rowsOf(await execSql(payload, sql`SELECT "table_name" AS t FROM "information_schema"."tables" WHERE "table_schema" = 'public' AND ("table_name" LIKE 'ad\\_%' OR "table_name" LIKE 'ads\\_%')`)) as { t: string }[]).map((r) => r.t);
for (const t of tables) for (const r of rowsOf(await execSql(payload, sql`SELECT row_to_json(x)::text AS j FROM ${sql.raw(`"${t}"`)} x`)) as { j: string }[]) for (const u of urlsIn(r.j)) anywhere.add(u);

type B = { url: string; pathname: string; size: number };
const blobs: B[] = [];
let cursor: string | undefined;
do {
  const r = await list({ prefix: "ads/", cursor, limit: 1000, token });
  blobs.push(...r.blobs.map((b) => ({ url: b.url, pathname: b.pathname, size: b.size })));
  cursor = r.cursor;
} while (cursor);

const groups: Record<string, B[]> = { utile: [], ancien: [], orphelin: [], zip: [] };
for (const b of blobs) {
  const u = normUrl(b.url);
  groups[b.pathname.startsWith("ads/zips/") ? "zip" : useful.has(u) ? "utile" : anywhere.has(u) ? "ancien" : "orphelin"].push(b);
}
const mo = (n: number) => `${(n / 1024 / 1024).toFixed(1)} Mo`;
for (const [k, list_] of Object.entries(groups)) {
  console.log(`${k.padEnd(9)} ${String(list_.length).padStart(4)} fichier(s)  ${mo(list_.reduce((s, b) => s + b.size, 0))}`);
  const byDir = new Map<string, number>();
  for (const b of list_) {
    const d = b.pathname.split("/").slice(0, 2).join("/");
    byDir.set(d, (byDir.get(d) ?? 0) + 1);
  }
  console.log(`          ${[...byDir.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} ×${n}`).join(", ")}`);
}
if (apply) {
  const doomed = [...groups.ancien, ...groups.orphelin, ...groups.zip].map((b) => b.url);
  for (let i = 0; i < doomed.length; i += 100) await del(doomed.slice(i, i + 100), { token });
  console.log(`Supprimé : ${doomed.length} fichier(s).`);
}
process.exit(0);
