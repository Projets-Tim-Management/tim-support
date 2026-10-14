#!/usr/bin/env node
/**
 * Déplace les inspirations rangées parmi les rushes vers leur collection,
 * Publicité › Inspirations (plan Publicité, §9 sexies, I1 — 14/10/2026).
 *
 *   npx tsx scripts/ads-inspirations-separation.ts                    (à blanc)
 *   npx tsx scripts/ads-inspirations-separation.ts --appliquer
 *   npx tsx scripts/ads-inspirations-separation.ts --aussi 10 --appliquer
 *
 * Sont déplacées : les fiches de rush d'usage « inspiration », et celles que
 * `--aussi <id,id>` désigne (une inspiration importée par erreur en matière).
 * Les fichiers sur le stockage sont gardés (la fiche de rush est supprimée sans
 * eux) ; la fiche déplacée est reconvertie et redécrite en fiche de style.
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

const apply = process.argv.includes("--appliquer");
const i = process.argv.indexOf("--aussi");
const extra = i > 0 ? String(process.argv[i + 1] ?? "").split(",").map(Number).filter((n) => n > 0) : [];
const { getPayload } = await import("payload");
const { default: config } = await import("@payload-config");
const payload = await getPayload({ config });

type Rush = { id: number; title: string; use?: string; verdict?: string; link?: string | null; why?: string | null; description?: string | null; original?: Record<string, unknown> };
const r = await payload.find({
  collection: "ad-rushes",
  where: { or: [{ use: { equals: "inspiration" } }, ...(extra.length ? [{ id: { in: extra } }] : [])] },
  pagination: false,
  depth: 0,
  overrideAccess: true,
});
const list = r.docs as unknown as Rush[];
console.log(`${list.length} fiche(s) à déplacer${apply ? "" : " — à blanc"} :`);
for (const d of list) {
  const why = (d.why || d.description || "").trim() || "À préciser : ce qui plaît dans cette pub.";
  console.log(`  → #${d.id} « ${d.title} » (${d.use === "inspiration" ? "inspiration" : "rangée en matière"}) — ${why.slice(0, 60)}`);
  if (!apply) continue;
  const { id, ...original } = (d.original ?? {}) as Record<string, unknown> & { id?: unknown };
  void id;
  const created = await payload.create({
    collection: "ad-inspirations",
    data: { title: d.title, verdict: d.verdict === "eviter" ? "eviter" : "aimer", link: d.link ?? null, why, original } as never,
    overrideAccess: true,
  });
  await payload.delete({ collection: "ad-rushes", id: d.id, overrideAccess: true, context: { keepFiles: true } });
  console.log(`     inspiration #${created.id} créée, rush #${d.id} retiré (fichiers gardés).`);
}
console.log(apply ? "Fait : les inspirations seront converties puis décrites en fiche de style dans la minute." : "Rien n'est écrit. Relancer avec --appliquer.");
process.exit(0);
