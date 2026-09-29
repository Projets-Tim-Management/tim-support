/**
 * Contrôle de sécurité de la base — le schéma `public` ne doit JAMAIS être
 * lisible par l'API Supabase (PostgREST, GraphQL).
 *
 * Le support ne se sert pas de l'API Supabase : Payload se connecte en direct,
 * rôle `postgres` (propriétaire des tables, BYPASSRLS). Les rôles de l'API,
 * `anon` et `authenticated`, n'ont donc besoin de RIEN. Le 29/09/2026, Supabase
 * a signalé les 131 tables ouvertes à ces rôles, RLS désactivée : la migration
 * 20260929_200000_fermer_api_supabase a tout fermé, et ce contrôle vérifie que
 * ça reste fermé — il tourne après chaque `db:migrate:apply` et à chaque
 * `db:migrate:status`, et fait échouer la commande au moindre écart.
 *
 * Sans effet de bord à l'import : `violations()` est pure et testée
 * (tests/db-security.test.ts), `SECURITY_SQL` est la requête qui l'alimente.
 */

/** Les rôles de l'API Supabase. */
export const API_ROLES = ["anon", "authenticated"];

/** Une ligne par objet du schéma public, avec ce que chaque rôle de l'API peut en faire. */
export const SECURITY_SQL = `
  SELECT 'schema' AS kind, 'public' AS name, NULL::boolean AS rls,
         has_schema_privilege('anon', 'public', 'USAGE') AS anon,
         has_schema_privilege('authenticated', 'public', 'USAGE') AS authenticated
  UNION ALL
  SELECT CASE WHEN c.relkind IN ('r', 'p') THEN 'table' ELSE 'vue' END, c.relname, c.relrowsecurity,
         has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
         has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  UNION ALL
  SELECT 'sequence', c.relname, NULL,
         has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE'),
         has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S'
  UNION ALL
  SELECT 'function', p.proname, NULL,
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'default-privilege', pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text, NULL,
         d.defaclacl::text ~ '(^|[{,])anon=',
         d.defaclacl::text ~ '(^|[{,])authenticated='
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public' AND pg_get_userbyid(d.defaclrole) = current_user
`;

/**
 * Les écarts, en phrases. Vide = conforme.
 * - toute table (ou vue) du schéma public doit avoir RLS ;
 * - aucun objet ne doit être accessible à `anon` ni `authenticated` ;
 * - les droits par défaut du rôle de migration ne doivent pas leur ouvrir les futures tables.
 * (Une vue n'a pas de RLS : elle est seulement vérifiée fermée.)
 */
export function violations(rows) {
  const out = [];
  for (const r of rows) {
    const open = API_ROLES.filter((role) => r[role] === true);
    if (open.length) out.push(`${r.kind} ${r.name} : accessible à ${open.join(" et ")}`);
    if (r.kind === "table" && r.rls === false) out.push(`table ${r.name} : RLS désactivée`);
  }
  return out;
}

/**
 * Joué par `db:migrate:apply` après CHAQUE migration, dans sa transaction : une
 * table créée par la migration naît avec RLS. Sans politique et sans FORCE, ça
 * ne change rien pour Payload (propriétaire), et ferme la table à l'API même si
 * un droit lui était donné un jour par erreur.
 */
export const HARDEN_SQL = `
  DO $$
  DECLARE t regclass;
  BEGIN
    FOR t IN SELECT c.oid::regclass FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
    LOOP
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
  END $$;
`;

/** Exécute le contrôle avec un client `pg` déjà connecté ; renvoie les écarts. */
export async function checkSecurity(client) {
  const { rows } = await client.query(SECURITY_SQL);
  return violations(rows);
}
