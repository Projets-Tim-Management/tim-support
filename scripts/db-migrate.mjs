#!/usr/bin/env node
/**
 * Helper de migrations DB — parce que le flux natif `payload migrate` se bloque
 * ici (base marquée « dev » d'un ancien push → prompt interactif « data loss ? »
 * qui gèle en headless), et que dev+prod PARTAGENT la même base Supabase.
 *
 * Usage :
 *   node scripts/db-migrate.mjs create <nom>     # génère la migration (payload CLI)
 *   node scripts/db-migrate.mjs apply            # applique les migrations EN ATTENTE
 *   node scripts/db-migrate.mjs apply --allow-destructive   # autorise DROP/DELETE (à éviter)
 *   node scripts/db-migrate.mjs status           # liste appliquées / en attente
 *
 * `apply` : pour chaque migration non enregistrée dans `payload_migrations`, extrait
 * le SQL de `up()`, REFUSE s'il contient un statement destructif (sauf override),
 * l'exécute dans UNE transaction avec lock_timeout/statement_timeout (ne bloque
 * jamais la prod), puis enregistre la migration. Non-interactif, déterministe.
 *
 * ⚠️ Coupe le serveur dev avant `apply` (il tient des connexions ; pooler Supabase
 *    plafonné à 15). Voir mémoire « migrations-payload-prod ».
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(projectDir, "migrations");

/** Charge .env.local dans process.env (dotenv n'est pas installé ici). */
function loadEnv() {
  const raw = readFileSync(join(projectDir, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

function newClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant (.env.local)");
  return new pg.Client({ connectionString: url, ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined });
}

/** Migrations sur disque (hors index.ts), triées par nom (préfixe horodaté). */
function diskMigrations() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

/** Extrait le SQL du premier bloc sql`...` de la fonction up(). */
function extractUpSql(name) {
  const file = readFileSync(join(migrationsDir, name + ".ts"), "utf8");
  const m = file.match(/export async function up[\s\S]*?sql`([\s\S]*?)`\)/);
  if (!m) throw new Error(`SQL up() introuvable dans ${name}.ts`);
  return m[1];
}

const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN|TYPE|CONSTRAINT|INDEX)|DELETE\s+FROM|TRUNCATE)\b/i;

async function getApplied(client) {
  const r = await client.query("SELECT name FROM payload_migrations WHERE batch > 0 ORDER BY name");
  return new Set(r.rows.map((x) => x.name));
}

async function cmdStatus() {
  const c = newClient();
  await c.connect();
  const applied = await getApplied(c);
  for (const name of diskMigrations()) console.log(`${applied.has(name) ? "✓ appliquée" : "· EN ATTENTE"}  ${name}`);
  await c.end();
}

function cmdCreate(name) {
  if (!name) throw new Error("Nom de migration requis : create <nom>");
  execFileSync(join(projectDir, "node_modules", ".bin", "payload"), ["migrate:create", name], {
    cwd: projectDir, stdio: "inherit", env: process.env,
  });
}

async function cmdApply(allowDestructive) {
  const c = newClient();
  await c.connect();
  const applied = await getApplied(c);
  const pending = diskMigrations().filter((n) => !applied.has(n));
  if (pending.length === 0) { console.log("Aucune migration en attente ✅"); await c.end(); return; }

  const batchRow = await c.query("SELECT COALESCE(MAX(batch),0)+1 AS b FROM payload_migrations WHERE batch > 0");
  const batch = batchRow.rows[0].b;
  console.log(`Migrations en attente : ${pending.join(", ")}\nBatch : ${batch}\n`);

  for (const name of pending) {
    const sqlUp = extractUpSql(name);
    if (DESTRUCTIVE.test(sqlUp) && !allowDestructive) {
      console.error(`❌ ${name} contient un statement DESTRUCTIF. Relis-le, puis relance avec --allow-destructive si c'est voulu.`);
      await c.end(); process.exit(1);
    }
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL lock_timeout = '10s'");     // ne jamais faire la queue derrière la prod
      await c.query("SET LOCAL statement_timeout = '120s'");
      await c.query(sqlUp);
      await c.query("INSERT INTO payload_migrations (name, batch) VALUES ($1, $2)", [name, batch]);
      await c.query("COMMIT");
      console.log(`✅ ${name}`);
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error(`❌ ${name} : ${e.message} (ROLLBACK, rien d'appliqué pour cette migration)`);
      await c.end(); process.exit(1);
    }
  }
  await c.end();
  console.log("\nTerminé. Pense à (re)démarrer le serveur dev.");
}

(async () => {
  loadEnv();
  const [cmd, arg] = process.argv.slice(2);
  const allowDestructive = process.argv.includes("--allow-destructive");
  if (cmd === "create") cmdCreate(arg);
  else if (cmd === "apply") await cmdApply(allowDestructive);
  else if (cmd === "status") await cmdStatus();
  else { console.error("Usage: db-migrate.mjs <create <nom> | apply [--allow-destructive] | status>"); process.exit(1); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
