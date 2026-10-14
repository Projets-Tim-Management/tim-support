#!/usr/bin/env node
/**
 * Reprend les inspirations saisies dans le Kit de marque (onglet Inspirations,
 * désormais masqué) comme inspirations de Publicité › Inspirations (plan
 * Publicité, §9 sexies, I1).
 *
 *   npx tsx scripts/ads-inspirations-reprise.ts            (à blanc : dit ce qu'il ferait)
 *   npx tsx scripts/ads-inspirations-reprise.ts --appliquer
 *
 * Une inspiration avec capture est copiée dans le dossier des rushes (la fiche
 * n'accepte que ce dossier), puis convertie et décrite comme les autres. Une
 * inspiration SANS fichier (un lien seul) ne peut pas être reprise : elle est
 * listée, pour que Charlie dépose la vidéo. Idempotent : une inspiration déjà
 * reprise (même nom) est sautée. Rien n'est effacé du kit.
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
const { getPayload } = await import("payload");
const { default: config } = await import("@payload-config");
const { put } = await import("@vercel/blob");
const { RUSH_PREFIX } = await import("@/modules/ads/lib/rushes");
const payload = await getPayload({ config });

type Insp = { verdict?: string; link?: string | null; why?: string; image?: { url?: string; filename?: string; mimeType?: string; filesize?: number } | null };
const kit = (await payload.findGlobal({ slug: "ads-brand-kit", depth: 1, overrideAccess: true })) as unknown as { inspirations?: Insp[] };
const list = kit.inspirations ?? [];
console.log(`${list.length} inspiration(s) dans le kit${apply ? "" : " — à blanc"}.`);

let n = 0;
for (const [i, insp] of list.entries()) {
  const title = `Inspiration du kit ${i + 1}${insp.why ? ` — ${insp.why.slice(0, 50)}` : ""}`;
  if (!insp.image?.url) {
    console.log(`  · ${title} : lien seul (${insp.link ?? "—"}) — à déposer en vidéo dans Publicité › Inspirations.`);
    continue;
  }
  const exists = await payload.count({ collection: "ad-inspirations", where: { title: { equals: title } }, overrideAccess: true });
  if (exists.totalDocs) {
    console.log(`  · ${title} : déjà reprise.`);
    continue;
  }
  console.log(`  + ${title} (${insp.image.filename})`);
  if (!apply) continue;
  const res = await fetch(insp.image.url);
  if (!res.ok) throw new Error(`Capture introuvable (HTTP ${res.status}) : ${insp.image.url}`);
  const data = Buffer.from(await res.arrayBuffer());
  const contentType = insp.image.mimeType ?? "image/png";
  const blob = await put(`${RUSH_PREFIX}${insp.image.filename ?? `inspiration-${i + 1}.png`}`, data, { access: "public", contentType, addRandomSuffix: true, token: process.env.BLOB_READ_WRITE_TOKEN });
  await payload.create({
    collection: "ad-inspirations",
    data: {
      title,
      verdict: insp.verdict === "eviter" ? "eviter" : "aimer",
      link: insp.link ?? null,
      why: insp.why ?? "",
      original: { url: blob.url, pathname: blob.pathname, filename: insp.image.filename ?? null, contentType, size: data.length },
    } as never,
    overrideAccess: true,
  });
  n++;
}
console.log(apply ? `${n} inspiration(s) reprise(s) : elles seront converties puis décrites dans la minute.` : "Rien n'est écrit. Relancer avec --appliquer.");
process.exit(0);
