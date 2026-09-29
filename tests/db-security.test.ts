import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HARDEN_SQL, SECURITY_SQL, violations } from "../scripts/db-security.mjs";

/**
 * Le schéma public reste fermé à l'API Supabase (alerte du 29/09/2026). Le
 * contrôle lui-même tourne contre la base à chaque `db:migrate:apply` et
 * `db:migrate:status` (le banc de test n'y a pas accès) ; ici, on vérifie
 * qu'il juge juste, et que la migration de fermeture fait ce qu'elle annonce.
 */

const row = (p: Record<string, unknown>) => ({ kind: "table", name: "users", rls: true, anon: false, authenticated: false, ...p });

describe("contrôle de sécurité : ce qui est un écart", () => {
  it("rien à signaler quand tout est fermé et RLS active", () => {
    expect(violations([row({}), row({ kind: "schema", name: "public", rls: null }), row({ kind: "sequence", name: "users_id_seq", rls: null })])).toEqual([]);
  });

  it("une table sans RLS est un écart, même fermée", () => {
    expect(violations([row({ rls: false })])).toEqual(["table users : RLS désactivée"]);
  });

  it("tout objet accessible à anon ou authenticated est un écart, rôle par rôle", () => {
    expect(violations([row({ anon: true, authenticated: true })])).toEqual(["table users : accessible à anon et authenticated"]);
    expect(violations([row({ kind: "sequence", name: "s", rls: null, authenticated: true })])).toEqual(["sequence s : accessible à authenticated"]);
    expect(violations([row({ kind: "schema", name: "public", rls: null, anon: true })])).toEqual(["schema public : accessible à anon"]);
    expect(violations([row({ kind: "default-privilege", name: "postgres:r", rls: null, anon: true })])).toEqual(["default-privilege postgres:r : accessible à anon"]);
  });

  it("une vue n'a pas de RLS : elle n'est jugée que sur ses droits", () => {
    expect(violations([row({ kind: "vue", name: "v", rls: false })])).toEqual([]);
  });

  it("la requête couvre schéma, tables et vues, séquences, fonctions et droits par défaut", () => {
    for (const k of ["'schema'", "relkind IN ('r', 'p', 'v', 'm', 'f')", "relkind = 'S'", "pg_proc", "pg_default_acl"]) expect(SECURITY_SQL).toContain(k);
  });
});

describe("migration de fermeture", () => {
  const up = readFileSync(join(process.cwd(), "migrations/20260929_200000_fermer_api_supabase.ts"), "utf8");

  it("retire tout à anon et authenticated : tables, séquences, fonctions, schéma, et droits par défaut", () => {
    for (const s of [
      "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated",
      "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated",
      "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated",
      "REVOKE USAGE ON SCHEMA public FROM anon, authenticated",
      "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated",
    ]) {
      expect(up).toContain(s);
    }
  });

  it("active RLS sans FORCE (Payload, propriétaire, n'y est pas soumis) et sans politique", () => {
    expect(up).toContain("ENABLE ROW LEVEL SECURITY");
    expect(up).not.toMatch(/FORCE ROW LEVEL SECURITY|CREATE POLICY|GRANT /);
    expect(HARDEN_SQL).toContain("ENABLE ROW LEVEL SECURITY");
    expect(HARDEN_SQL).not.toMatch(/FORCE|POLICY|GRANT/);
  });

  it("ne rouvre rien en cas de retour arrière", () => {
    expect(up).toMatch(/export async function down\([^)]*\): Promise<void> \{\}/);
  });
});
