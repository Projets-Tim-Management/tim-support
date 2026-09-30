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
 *
 * Les EXCEPTIONS ACCEPTÉES sont listées ci-dessous, chacune avec sa
 * justification. Le contrôle les affiche, mais ne les compte pas comme des
 * écarts. Toute nouvelle exception doit être validée par Charlie avant d'être
 * ajoutée ici — elle ne s'ajoute jamais pour faire passer un contrôle.
 */

/** Les rôles de l'API Supabase. */
export const API_ROLES = ["anon", "authenticated"];

/**
 * Exceptions acceptées — validées par Charlie le 30/09/2026.
 *
 * `schema public`, par PUBLIC seulement : Postgres accorde par défaut l'usage
 * du schéma `public` à tous les rôles (PUBLIC), et les rôles de l'API en
 * héritent. Cet usage ne donne accès à AUCUNE table (plus aucun droit, RLS
 * partout) ni à aucune fonction (il n'y en a aucune dans le schéma, et une
 * fonction ouverte à PUBLIC serait signalée comme écart). Le retirer à PUBLIC
 * risquerait de gêner des rôles internes de Supabase. L'exception ne couvre
 * QUE l'héritage de PUBLIC : un droit donné explicitement à `anon` ou
 * `authenticated` sur le schéma reste un écart.
 */
export const ACCEPTED_EXCEPTIONS = [
  {
    kind: "schema",
    name: "public",
    matches: (r) => r.kind === "schema" && r.name === "public" && r.via_public_only === true,
    reason: "usage du schéma hérité de PUBLIC — aucune table ni fonction accessible (validé le 30/09/2026)",
  },
];

/** Une ligne par objet du schéma public, avec ce que chaque rôle de l'API peut en faire. */
export const SECURITY_SQL = `
  SELECT 'schema' AS kind, 'public' AS name, NULL::boolean AS rls,
         has_schema_privilege('anon', 'public', 'USAGE') AS anon,
         has_schema_privilege('authenticated', 'public', 'USAGE') AS authenticated,
         -- L'accès vient-il SEULEMENT de PUBLIC (aucun droit explicite pour anon ni authenticated) ?
         NOT EXISTS (
           SELECT 1 FROM pg_namespace ns, aclexplode(ns.nspacl) a
           WHERE ns.nspname = 'public' AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
         ) AS via_public_only
  UNION ALL
  SELECT CASE WHEN c.relkind IN ('r', 'p') THEN 'table' ELSE 'vue' END, c.relname, c.relrowsecurity,
         has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
         has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
         NULL
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  UNION ALL
  SELECT 'sequence', c.relname, NULL,
         has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE'),
         has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE'),
         NULL
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S'
  UNION ALL
  SELECT 'function', p.proname, NULL,
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         NULL
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'default-privilege', pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text, NULL,
         d.defaclacl::text ~ '(^|[{,])anon=',
         d.defaclacl::text ~ '(^|[{,])authenticated=',
         NULL
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
    if (ACCEPTED_EXCEPTIONS.some((e) => e.matches(r))) continue;
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

/** Les exceptions acceptées effectivement rencontrées, en phrases — pour qu'on les voie à chaque contrôle. */
export function acceptedFound(rows) {
  return ACCEPTED_EXCEPTIONS.filter((e) => rows.some((r) => e.matches(r))).map((e) => `${e.kind} ${e.name} : ${e.reason}`);
}

/** Exécute le contrôle avec un client `pg` déjà connecté ; renvoie les écarts et les exceptions acceptées. */
export async function checkSecurity(client) {
  const { rows } = await client.query(SECURITY_SQL);
  return { problems: violations(rows), accepted: acceptedFound(rows) };
}
