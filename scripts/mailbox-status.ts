#!/usr/bin/env node
/**
 * État des boîtes connectées, et LECTURE À BLANC de ce qui serait rattaché.
 *
 *   npx tsx scripts/mailbox-status.ts            # à blanc : rien n'est écrit
 *   npx tsx scripts/mailbox-status.ts --ecrire   # écrit réellement sur les fiches
 *
 * La lecture à blanc s'arrête aux MÉTADONNÉES : elle dit quels échanges
 * concernent un prospect connu, sans télécharger le contenu d'un seul message.
 * C'est la vérification à faire avant d'écrire quoi que ce soit — et la preuve,
 * pour la personne qui a connecté sa boîte, que le tri se fait bien avant.
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
const { syncMailbox, recordSync } = await import("@/modules/partner/lib/mailbox/sync");

const write = process.argv.includes("--ecrire");
const payload = await getPayload({ config });

const conns = await payload.find({
  collection: "mailbox-connections",
  limit: 20,
  depth: 0,
  overrideAccess: true,
});

if (conns.docs.length === 0) {
  console.log("\nAucune boîte connectée.\n");
  process.exit(0);
}

console.log(`\n── ${conns.docs.length} boîte(s) ─────────────────────────────────────────────`);
for (const doc of conns.docs as unknown as Record<string, unknown>[]) {
  console.log(
    `  ${String(doc.accountEmail).padEnd(34)} ${doc.status}` +
      ` · reprise depuis ${String(doc.syncSince ?? "?").slice(0, 10)}` +
      ` · ${doc.capturedCount ?? 0} rattaché(s)` +
      `${doc.lastError ? ` · ⚠️ ${doc.lastError}` : ""}`,
  );
}

for (const doc of conns.docs) {
  const conn = doc as never;
  console.log(
    `\n── ${write ? "ÉCRITURE" : "LECTURE À BLANC"} : ${(doc as { accountEmail?: string }).accountEmail} ──`,
  );
  const summary = await syncMailbox(payload, conn, { dry: !write });

  if (!summary.ok) {
    console.log(`  ❌ ${summary.error}`);
    continue;
  }
  console.log(`  examinés (métadonnées seules) : ${summary.scanned}`);
  console.log(`  concernant un prospect connu  : ${summary.matched}`);
  if (write) {
    console.log(`  écrits                        : ${summary.written}`);
    console.log(`  déjà présents                 : ${summary.known}`);
    await recordSync(payload, conn, summary);
  } else if (summary.preview.length) {
    console.log("\n  Ce qui serait rattaché :");
    for (const line of summary.preview) console.log(`    ${line}`);
    if (summary.matched > summary.preview.length) {
      console.log(`    … et ${summary.matched - summary.preview.length} autre(s)`);
    }
  }
}

console.log("");
process.exit(0);
