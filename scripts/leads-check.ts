#!/usr/bin/env node
/**
 * Contrôle du canal d'acquisition des soumissions déjà enregistrées.
 *
 *   npx tsx scripts/leads-check.ts             # constate, ne change rien
 *   npx tsx scripts/leads-check.ts --corriger  # réaligne les écarts
 *
 * Le canal est FIGÉ au moment de la soumission, pas recalculé à l'affichage.
 * C'est voulu — une fiche ne doit pas changer de provenance dans le dos de
 * quelqu'un — mais ça veut dire qu'ajouter une régie laisse derrière soi des
 * leads étiquetés selon l'ancienne règle.
 *
 * Ce script rejoue `resolveChannel` sur l'attribution CONSERVÉE de chaque
 * soumission et signale les désaccords. C'est la seule façon de savoir ce
 * qu'un changement de règle a laissé derrière lui : les compteurs, eux,
 * paraissent normaux.
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
const { resolveChannel } = await import("@/modules/forms/lib/channel");
const { channelLabel } = await import("@/modules/forms/lib/form-schema");
const { SOURCE_BY_CHANNEL } = await import("@/modules/forms/lib/to-opportunity");

const fix = process.argv.includes("--corriger");
const payload = await getPayload({ config });

const subs = await payload.find({
  collection: "form-submissions",
  limit: 2000,
  depth: 0,
  sort: "-createdAt",
  overrideAccess: true,
});

type Sub = Record<string, unknown> & { id: number; attribution?: Record<string, unknown> };

const tally: Record<string, number> = {};
const drift: { id: number; from: string; to: string; utm: string }[] = [];

for (const doc of subs.docs as unknown as Sub[]) {
  const stored = String(doc.channel ?? "?");
  tally[stored] = (tally[stored] ?? 0) + 1;

  // L'attribution est conservée telle qu'elle est arrivée : c'est elle qui
  // permet de rejouer la décision sans rien inventer.
  const a = (doc.attribution ?? doc) as Record<string, unknown>;
  const now = resolveChannel(
    {
      utmSource: a.utmSource as string,
      utmMedium: a.utmMedium as string,
      gclid: a.gclid as string,
      msclkid: a.msclkid as string,
      oaiclid: a.oaiclid as string,
      placement: a.placement as never,
      lpSlug: a.lpSlug as string,
    },
    (doc.defaultChannel as never) ?? "seo",
  ).channel;

  if (now !== stored) {
    drift.push({
      id: doc.id,
      from: stored,
      to: now,
      utm: [a.utmSource, a.utmMedium].filter(Boolean).join(" / ") || "—",
    });
  }
}

console.log(`\n── ${subs.docs.length} soumission(s) ───────────────────────────────────`);
for (const [k, v] of Object.entries(tally).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${(channelLabel(k) ?? k).padEnd(24)} ${v}`);
}

const chatgpt = (subs.docs as unknown as Sub[]).filter((d) => {
  const a = (d.attribution ?? d) as Record<string, unknown>;
  return String(a.utmSource ?? "").toLowerCase().includes("chatgpt") || Boolean(a.oaiclid);
});
console.log(`\n  dont portant une trace ChatGPT : ${chatgpt.length}`);

if (drift.length === 0) {
  console.log("\n✅ Aucun écart : le canal stocké correspond à ce que la règle actuelle déciderait.\n");
  process.exit(0);
}

console.log(`\n⚠️  ${drift.length} écart(s) entre le canal stocké et la règle actuelle :`);
for (const d of drift.slice(0, 30)) {
  console.log(`  #${d.id}  ${d.from} → ${d.to}   (${d.utm})`);
}
if (drift.length > 30) console.log(`  … et ${drift.length - 30} autre(s)`);

if (!fix) {
  console.log("\nRelancer avec --corriger pour les réaligner.\n");
  process.exit(0);
}

for (const d of drift) {
  await payload.update({
    collection: "form-submissions",
    id: d.id,
    data: { channel: d.to } as never,
    overrideAccess: true,
  });

  /**
   * L'opportunité aussi : c'est ELLE qu'on lit dans les tableaux de bord.
   * Corriger la soumission sans la fiche laisserait l'intitulé faux là où il
   * compte, tout en donnant l'impression que c'est réglé.
   */
  const clients = await payload.find({
    collection: "partner-clients",
    where: { formSubmission: { equals: d.id } },
    limit: 5,
    depth: 0,
    overrideAccess: true,
  });
  for (const c of clients.docs) {
    await payload.update({
      collection: "partner-clients",
      id: c.id,
      data: { source: SOURCE_BY_CHANNEL[d.to as never] } as never,
      overrideAccess: true,
    });
  }
}

console.log(`\n✅ ${drift.length} soumission(s) réalignée(s), fiches comprises.\n`);
process.exit(0);
