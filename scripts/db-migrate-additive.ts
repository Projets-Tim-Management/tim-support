/**
 * Générer une migration ADDITIVE tant que la base garde les tables de l'ancien
 * moteur vidéo (retiré du code le 19/10/2026, supprimé de la base au « temps 2 »).
 *
 * `payload migrate:create` compare la configuration au dernier instantané : il y
 * voit ces tables disparaître, et dès qu'un nouveau type apparaît, il demande
 * « créé ou renommé ? » — une question qu'il pose au clavier, sans réponse
 * possible ici. Ce script fusionne le schéma d'avant et le nouveau : rien ne
 * disparaît, donc le générateur n'écrit que des ajouts, sans question. Les
 * passages à NOT NULL d'une colonne existante sont écartés (ils échoueraient
 * sur des lignes vides, et la règle est tenue par le formulaire).
 *
 *   npx tsx scripts/db-migrate-additive.ts <nom>
 *
 * À SUPPRIMER après la migration destructive du temps 2 : `npm run
 * db:migrate:create` redeviendra suffisant.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
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

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) throw new Error("Nom de migration requis (minuscules, chiffres, _).");
const { getPayload, writeMigrationIndex } = await import("payload");
const { default: config } = await import("@payload-config");
const payload = await getPayload({ config });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = payload.db as any;
const { generateDrizzleJson, generateMigration } = db.requireDrizzleKit();
const after = await generateDrizzleJson(db.schema);
const dir = db.migrationDir as string;
const latest = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse()[0];
const before = JSON.parse(readFileSync(join(dir, latest), "utf8"));

type Obj = Record<string, Record<string, unknown>>;
const union = structuredClone(after);
for (const [k, t] of Object.entries(before.tables as Obj)) {
  if (!union.tables[k]) {
    union.tables[k] = t;
    continue;
  }
  for (const part of ["columns", "indexes", "foreignKeys", "uniqueConstraints"]) {
    const from = (t as Obj)[part] ?? {};
    const to = (union.tables[k][part] ??= {});
    for (const [n, v] of Object.entries(from)) {
      if (!to[n]) to[n] = v;
      // Une colonne existante qui deviendrait NOT NULL : on garde l'état de la base.
      else if (part === "columns" && (v as { notNull?: boolean }).notNull === false) (to[n] as { notNull?: boolean }).notNull = false;
    }
  }
}
for (const [k, e] of Object.entries(before.enums as Obj)) {
  if (!union.enums[k]) {
    union.enums[k] = e;
    continue;
  }
  const values = [...((e as { values: string[] }).values ?? [])];
  for (const v of union.enums[k].values as string[]) if (!values.includes(v)) values.push(v);
  union.enums[k].values = values;
}
union.prevId = before.id;

const up: string[] = await generateMigration(before, union);
const down: string[] = await generateMigration(union, before);
const unsafe = up.filter((s) => /\bDROP\b|SET NOT NULL|RENAME/i.test(s));
if (unsafe.length) throw new Error(`Instruction non additive :\n${unsafe.join("\n")}`);
if (!up.length) {
  console.log("Aucun ajout à faire.");
  process.exit(0);
}
const [d, t] = new Date().toISOString().split("T");
const file = `${d.replace(/\D/g, "")}_${t.split(".")[0].replace(/\D/g, "")}_${name}`;
const block = (s: string[]) => `  await db.execute(sql\`\n   ${s.join("\n  ")}\`)`;
writeFileSync(
  join(dir, `${file}.ts`),
  `import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'\n\n// ADDITIVE — générée par scripts/db-migrate-additive.ts (schéma d'avant fusionné : l'ancien moteur vidéo reste en base jusqu'au temps 2).\nexport async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {\n${block(up)}\n}\n\nexport async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {\n${block(down)}\n}\n`,
);
writeFileSync(join(dir, `${file}.json`), JSON.stringify(union, null, 2));
writeMigrationIndex({ migrationsDir: dir });
console.log(`Migration ${file} : ${up.length} instruction(s) d'ajout.`);
process.exit(0);
