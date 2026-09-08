#!/usr/bin/env node
/**
 * Crée un accès de TEST à l'espace client, et sait le supprimer.
 *
 *   npx tsx scripts/portal-test-access.ts creer <email>
 *   npx tsx scripts/portal-test-access.ts supprimer
 *
 * Une opportunité jetable, nommée sans ambiguïté, plus un compte d'accès. On
 * passe par le vrai chemin de connexion — e-mail puis code à six chiffres — et
 * non par une porte dérobée : ce qu'on veut vérifier, c'est justement ce que
 * vivra un client.
 *
 * `supprimer` efface l'opportunité de test et tout ce qui s'y rattache. Il ne
 * touche à rien d'autre : il ne connaît qu'un seul nom d'entreprise.
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

/** Nom repère : c'est LUI qui rend la suppression sûre. */
const COMPANY = "ZZ — TEST import CSV (à supprimer)";

const [action, email] = process.argv.slice(2);
const payload = await getPayload({ config });

const findClient = async () =>
  (
    await payload.find({
      collection: "partner-clients",
      where: { companyName: { equals: COMPANY } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as { id: number } | undefined;

if (action === "supprimer") {
  const client = await findClient();
  if (!client) {
    console.log("\nRien à supprimer.\n");
    process.exit(0);
  }
  const accounts = await payload.find({
    collection: "client-portal-accounts",
    where: { client: { equals: client.id } },
    limit: 20,
    overrideAccess: true,
  });
  for (const a of accounts.docs) {
    await payload.delete({ collection: "client-portal-accounts", id: a.id, overrideAccess: true });
  }
  await payload.delete({ collection: "partner-clients", id: client.id, overrideAccess: true });
  console.log(`\n✅ Opportunité de test et ${accounts.docs.length} accès supprimés.\n`);
  process.exit(0);
}

if (action !== "creer" || !email?.includes("@")) {
  console.error("Usage : npx tsx scripts/portal-test-access.ts creer <email>");
  process.exit(1);
}

const partner = (
  await payload.find({ collection: "partners", limit: 1, depth: 0, overrideAccess: true })
).docs[0] as { id: number } | undefined;
if (!partner) {
  console.error("Aucun partenaire en base : impossible de rattacher l'opportunité.");
  process.exit(1);
}

let client = await findClient();
if (!client) {
  client = (await payload.create({
    collection: "partner-clients",
    data: {
      companyName: COMPANY,
      email,
      partner: partner.id,
      clientStatus: "en-test",
      // « En cours de saisie » : c'est l'état où le dossier est MODIFIABLE.
      // « Validé » le verrouillerait, et il n'y aurait rien à tester.
      onboardingStatus: "en-cours",
      _status: "published",
    } as never,
    overrideAccess: true,
  })) as never as { id: number };
  console.log(`\nOpportunité de test créée (#${client.id}).`);
} else {
  console.log(`\nOpportunité de test déjà présente (#${client.id}).`);
}

const existing = (
  await payload.find({
    collection: "client-portal-accounts",
    where: { email: { equals: email.toLowerCase() } },
    limit: 1,
    overrideAccess: true,
  })
).docs[0] as { id: number } | undefined;

if (existing) {
  await payload.update({
    collection: "client-portal-accounts",
    id: existing.id,
    data: { client: client.id, active: true } as never,
    overrideAccess: true,
  });
  console.log("Accès existant réactivé et rattaché.");
} else {
  await payload.create({
    collection: "client-portal-accounts",
    data: { email: email.toLowerCase(), client: client.id, active: true } as never,
    overrideAccess: true,
  });
  console.log("Accès créé.");
}

console.log(`
Pour entrer :
  1. ouvrir  /espace-client
  2. saisir  ${email}
  3. le code à six chiffres arrive par e-mail (valable 15 min)

Pour tout effacer ensuite :
  npx tsx scripts/portal-test-access.ts supprimer
`);
process.exit(0);
