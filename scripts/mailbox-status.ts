#!/usr/bin/env node
/**
 * État des boîtes connectées, et LECTURE À BLANC de ce qui serait rattaché.
 *
 *   npx tsx scripts/mailbox-status.ts              # à blanc : rien n'est écrit
 *   npx tsx scripts/mailbox-status.ts --ecrire     # écrit réellement sur les fiches
 *   npx tsx scripts/mailbox-status.ts --ecrire --max=60   # sur une tranche courte
 *
 *   npx tsx scripts/mailbox-status.ts --etat      # l'état des curseurs, sans rien lire
 *   npx tsx scripts/mailbox-status.ts --voir      # relit les derniers écrits
 *   npx tsx scripts/mailbox-status.ts --refaire   # efface les échanges CAPTÉS et recommence
 *
 * `--max` borne le nombre de messages EXAMINÉS, pas écrits. Il sert à regarder
 * ce que donne une première tranche avant de lâcher un passage complet sur des
 * fiches que toute l'équipe consulte.
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

/**
 * Efface les échanges CAPTÉS — ceux qui portent un `sourceMessageId` — pour
 * pouvoir relancer un import propre.
 *
 * Ne touche à rien d'autre : ni aux notes, ni aux tâches, ni aux e-mails partis
 * du drawer, qui n'ont pas cet identifiant. C'est ce qui rend l'opération
 * rejouable pendant qu'on met au point le tri, sans jamais effacer le travail
 * de quelqu'un.
 */
const redo = process.argv.includes("--refaire");
const write = process.argv.includes("--ecrire");
const maxArg = process.argv.find((a) => a.startsWith("--max="))?.split("=")[1];
const max = maxArg ? Number(maxArg) : undefined;
const payload = await getPayload({ config });

if (redo) {
  const captured = await payload.find({
    collection: "client-activities",
    where: { sourceMessageId: { exists: true } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  });
  for (const a of captured.docs) {
    await payload.delete({ collection: "client-activities", id: a.id, overrideAccess: true });
  }
  console.log(`\n${captured.docs.length} échange(s) capté(s) effacé(s).`);

  const conns = await payload.find({ collection: "mailbox-connections", limit: 20, overrideAccess: true });
  for (const c of conns.docs) {
    await payload.update({
      collection: "mailbox-connections",
      id: c.id,
      data: { capturedCount: 0 } as never,
      overrideAccess: true,
    });
  }
}

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
      `\n${" ".repeat(4)}présent à jour jusqu'au ${String(doc.syncedUpTo ?? "—").slice(0, 10)}` +
      ` · passé rattrapé jusqu'au ${String(doc.backfillBefore ?? "—").slice(0, 10)}` +
      ` (objectif ${String(doc.syncSince ?? "?").slice(0, 10)})` +
      `${doc.lastError ? ` · ⚠️ ${doc.lastError}` : ""}`,
  );
}

// `--etat` : où en sont les curseurs, sans toucher à Gmail. Une lecture, même
// à blanc, prend plusieurs minutes — trop long pour une simple vérification.
if (process.argv.includes("--etat")) {
  console.log("");
  process.exit(0);
}

for (const doc of conns.docs) {
  const conn = doc as never;
  console.log(
    `\n── ${write ? "ÉCRITURE" : "LECTURE À BLANC"} : ${(doc as { accountEmail?: string }).accountEmail} ──`,
  );
  const summary = await syncMailbox(payload, conn, { dry: !write, ...(max ? { max } : {}) });

  if (!summary.ok) {
    console.log(`  ❌ ${summary.error}`);
    continue;
  }
  console.log(`  examinés (métadonnées seules) : ${summary.scanned}`);
  console.log(`  concernant un prospect connu  : ${summary.matched}`);
  if (write) {
    console.log(`  écrits                        : ${summary.written}`);
    console.log(`  déjà présents                 : ${summary.known}`);
    console.log(
      `  reprise du passé              : ${summary.backfillDone ? "terminée" : `descendue au ${String(summary.backfillBefore ?? "—").slice(0, 10)}`}`,
    );
    await recordSync(payload, conn, summary);
  } else if (summary.preview.length) {
    console.log("\n  Ce qui serait rattaché :");
    for (const line of summary.preview) console.log(`    ${line}`);
    if (summary.matched > summary.preview.length) {
      console.log(`    … et ${summary.matched - summary.preview.length} autre(s)`);
    }
  }
}

/**
 * Relecture de ce qui a réellement été écrit.
 *
 * Le compteur dit combien ; il ne dit pas si le texte est lisible, si le sens
 * est le bon, ni si le fil cité a bien été coupé. C'est là que ça se voit.
 */
if (process.argv.includes("--voir")) {
  const recent = await payload.find({
    collection: "client-activities",
    where: { sourceMessageId: { exists: true } },
    sort: "-occurredAt",
    limit: 6,
    depth: 1,
    overrideAccess: true,
  });

  console.log("\n── DERNIERS ÉCHANGES ÉCRITS ────────────────────────────────────");
  for (const a of recent.docs as unknown as Record<string, unknown>[]) {
    const client = a.client as { companyName?: string } | null;
    const body = String(a.content ?? "").replace(/\s+/g, " ").trim();
    console.log(`\n  ${a.title}`);
    console.log(`    fiche      ${client?.companyName ?? "?"}`);
    console.log(`    sens       ${a.emailDirection}   ·   ${a.recipients}`);
    if (a.attachmentNames) console.log(`    pièces     ${a.attachmentNames}`);
    console.log(`    texte      ${body.slice(0, 160)}${body.length > 160 ? "…" : ""}`);
    console.log(`    longueur   ${body.length} caractères`);
  }
}

console.log("");
process.exit(0);
