#!/usr/bin/env node
/**
 * Envoi d'un APERÇU d'un message de séquence, à une adresse choisie.
 *
 * Usage :
 *   npx tsx scripts/preview-sequence.ts <séquence> <message> <destinataire> [--partenaire=<id|email>]
 *   npx tsx scripts/preview-sequence.ts sans-retour --liste
 *
 * Ce que ça N'EST PAS : un envoi de séquence. Rien n'est enrôlé, aucune date
 * n'est posée, aucune séquence en cours n'est touchée. Le message est fabriqué
 * par le MÊME code que l'envoi réel (`buildSequenceEmail`) et part par le même
 * canal — c'est le seul moyen de voir ce qui arrivera vraiment chez le prospect,
 * dans son client de messagerie, avec ses polices et ses images bloquées.
 *
 * La signature est celle d'un vrai partenaire, lue dans sa fiche : c'est
 * précisément ce qu'on vient vérifier.
 *
 * ⚠️ Le lien de désinscription de l'aperçu est RÉEL. Cliquer dessus inscrit
 *    l'adresse en liste de suppression.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Charge .env.local dans process.env (dotenv n'est pas installé ici). */
for (const line of readFileSync(join(projectDir, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const { getPayload } = await import("payload");
const { default: config } = await import("@payload-config");
const { buildSequenceEmail } = await import("@/modules/marketing/lib/sequence-emails");
const { renderSignature, signatureFromPartner, signatureText } = await import(
  "@/modules/partner/lib/signature"
);
const { unsubscribeUrl } = await import("@/core/lib/email-suppression");

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const positional = args.filter((a) => !a.startsWith("--"));
const [sequenceKey, messageKey, recipient] = positional;

if (!sequenceKey) {
  console.error("Usage : npx tsx scripts/preview-sequence.ts <séquence> <message> <destinataire>");
  process.exit(1);
}

const payload = await getPayload({ config });

const sequence = (
  await payload.find({
    collection: "sequences",
    where: { key: { equals: sequenceKey } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
).docs[0] as
  | { label?: string; signature?: string; fromEmail?: string; messages?: { key?: string | null }[] }
  | undefined;

if (!sequence) {
  console.error(`Séquence « ${sequenceKey} » introuvable.`);
  process.exit(1);
}

if (args.includes("--liste") || !messageKey) {
  console.log(`\n${sequence.label} — messages :`);
  for (const m of sequence.messages ?? []) {
    console.log(`  ${m.key}\t${(m as { subject?: string }).subject ?? ""}`);
  }
  process.exit(0);
}

const theme = (sequence.messages ?? []).find((m) => m.key === messageKey);
if (!theme) {
  console.error(`Message « ${messageKey} » absent de la séquence.`);
  process.exit(1);
}
if (!recipient?.includes("@")) {
  console.error("Destinataire manquant ou invalide.");
  process.exit(1);
}

/**
 * Le partenaire qui signe : celui demandé, sinon celui dont l'adresse est celle
 * du destinataire — s'envoyer un aperçu à soi-même doit montrer SA signature.
 */
const wanted = flag("partenaire") ?? recipient;
const partners = await payload.find({
  collection: "partners",
  where: wanted.includes("@") ? { email: { equals: wanted } } : { id: { equals: wanted } },
  limit: 1,
  depth: 1,
  overrideAccess: true,
});
const fiche = (partners.docs[0] ?? null) as unknown as Record<string, unknown> | null;
if (!fiche) console.warn(`⚠️  Aucun partenaire pour « ${wanted} » : signature générique.`);

const sig = signatureFromPartner(fiche);
const mail = buildSequenceEmail(theme, {
  firstName: (fiche?.firstName as string) || undefined,
  email: recipient,
  unsubscribeUrl: unsubscribeUrl(recipient),
  closing: sequence.signature,
  signatureHtml: renderSignature(sig),
  signatureText: signatureText(sig),
});

if (!mail) {
  console.error("Le message est incomplet (texte, bouton ou lien manquant) : rien n'est envoyé.");
  process.exit(1);
}

const from = sequence.fromEmail || process.env.SEQUENCE_FROM || "info@tim-management.fr";
await payload.sendEmail({
  to: recipient,
  from,
  subject: `[Aperçu] ${mail.subject}`,
  html: mail.html,
  text: mail.text,
});

console.log(`\n✅ Aperçu envoyé à ${recipient}`);
console.log(`   séquence   ${sequence.label} → ${messageKey}`);
console.log(`   expéditeur ${from}`);
console.log(`   signature  ${sig.name ? signatureText(sig).replace(/\n/g, " · ") : "aucune (générique)"}`);
process.exit(0);
