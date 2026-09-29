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
 *   node scripts/db-migrate.mjs status           # liste appliquées / en attente, puis contrôle de sécurité
 *   node scripts/db-migrate.mjs security         # contrôle de sécurité seul (schéma public fermé à l'API Supabase)
 *
 * `apply` : pour chaque migration non enregistrée dans `payload_migrations`, extrait
 * le SQL de `up()`, REFUSE s'il contient un statement destructif (sauf override),
 * l'exécute dans UNE transaction avec lock_timeout/statement_timeout (ne bloque
 * jamais la prod), active RLS sur les tables qu'elle a créées (scripts/db-security.mjs),
 * puis enregistre la migration. Non-interactif, déterministe. À la fin, le contrôle de
 * sécurité fait échouer la commande si une table est ouverte à l'API Supabase.
 *
 * ⚠️ Coupe le serveur dev avant `apply` (il tient des connexions ; pooler Supabase
 *    plafonné à 15). Voir mémoire « migrations-payload-prod ».
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { checkSecurity, HARDEN_SQL } from "./db-security.mjs";

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

/** Le schéma public reste fermé à l'API Supabase ; sinon, la commande échoue (code 1). */
async function reportSecurity(c) {
  const problems = await checkSecurity(c);
  if (!problems.length) {
    console.log("🔒 Sécurité : schéma public fermé à l'API Supabase (anon, authenticated), RLS partout.");
    return true;
  }
  console.error(`❌ Sécurité : ${problems.length} écart(s) — le schéma public est lisible par l'API Supabase :`);
  for (const p of problems.slice(0, 20)) console.error(`   · ${p}`);
  if (problems.length > 20) console.error(`   · … et ${problems.length - 20} autre(s)`);
  return false;
}

async function cmdStatus() {
  const c = newClient();
  await c.connect();
  const applied = await getApplied(c);
  for (const name of diskMigrations()) console.log(`${applied.has(name) ? "✓ appliquée" : "· EN ATTENTE"}  ${name}`);
  const ok = await reportSecurity(c);
  await c.end();
  if (!ok) process.exit(1);
}

async function cmdSecurity() {
  const c = newClient();
  await c.connect();
  const ok = await reportSecurity(c);
  await c.end();
  if (!ok) process.exit(1);
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
      await c.query(HARDEN_SQL);
      await c.query("INSERT INTO payload_migrations (name, batch) VALUES ($1, $2)", [name, batch]);
      await c.query("COMMIT");
      console.log(`✅ ${name}`);
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      console.error(`❌ ${name} : ${e.message} (ROLLBACK, rien d'appliqué pour cette migration)`);
      await c.end(); process.exit(1);
    }
  }
  const ok = await reportSecurity(c);
  await c.end();
  if (!ok) process.exit(1);
  console.log("\nTerminé. Pense à (re)démarrer le serveur dev.");
}

(async () => {
  loadEnv();
  const [cmd, arg] = process.argv.slice(2);
  const allowDestructive = process.argv.includes("--allow-destructive");
  if (cmd === "create") cmdCreate(arg);
  else if (cmd === "apply") await cmdApply(allowDestructive);
  else if (cmd === "status") await cmdStatus();
  else if (cmd === "security") await cmdSecurity();
  else { console.error("Usage: db-migrate.mjs <create <nom> | apply [--allow-destructive] | status | security>"); process.exit(1); }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
