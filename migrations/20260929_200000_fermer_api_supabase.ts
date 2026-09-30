import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Fermer le schéma `public` à l'API Supabase (alerte Supabase du 29/09/2026 :
 * « rls_disabled_in_public », « sensitive_columns_exposed »).
 *
 * Constat avant migration : les 131 tables étaient ouvertes en lecture ET en
 * écriture aux rôles `anon` et `authenticated` (ceux de PostgREST et GraphQL),
 * sans RLS, et les droits par défaut ouvraient les futures tables. Le support
 * n'utilise pas l'API Supabase : Payload se connecte en direct, rôle
 * `postgres`, propriétaire de toutes les tables et BYPASSRLS — il n'est touché
 * par rien de ce qui suit.
 *
 * 1. Retirer tous les droits de `anon` et `authenticated` sur les tables,
 *    séquences et fonctions du schéma, et l'accès au schéma lui-même : c'est
 *    la seule façon de couvrir aussi les droits par défaut de `supabase_admin`,
 *    que `postgres` n'a pas le droit de modifier.
 * 2. Ne plus leur ouvrir les futurs objets créés par `postgres` (droits par défaut).
 * 3. Activer RLS sur toutes les tables, SANS politique (donc tout refusé aux
 *    rôles soumis à RLS) et SANS FORCE (le propriétaire, Payload, n'y est pas
 *    soumis).
 *
 * Écrite à la main : Payload ne suit ni les droits ni RLS, l'instantané JSON
 * est celui de la migration précédente. Le contrôle scripts/db-security.mjs
 * vérifie après chaque migration que tout reste fermé.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
  REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  DO $$
  DECLARE t regclass;
  BEGIN
    FOR t IN SELECT c.oid::regclass FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
    LOOP
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
  END $$;`)
}

/** On ne rouvre pas : revenir en arrière rendrait la base à nouveau lisible par l'API. */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {}
