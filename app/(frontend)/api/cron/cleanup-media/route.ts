import { NextResponse } from "next/server";
import { sql } from "@payloadcms/db-postgres";

import {
  COLONNES_TEXTE_LIBRE,
  conditionCitee,
  conditionReferencee,
  type Reference,
} from "@/core/lib/media-orphans";
import { payloadClient } from "@/core/payload-client";

/**
 * Balayage des médias qui ne servent à rien.
 *
 * POURQUOI. Chaque essai laisse une trace : une capture d'écran déposée pour
 * voir ce que ça donne, un GIF remplacé, un logo reposé sous un autre nom. Ces
 * fichiers ne sont rattachés à rien et personne ne pense à les retirer — la
 * médiathèque devient un grenier où l'on ne retrouve plus ce qu'on cherche.
 *
 * CE QU'IL SUPPRIME. Un média ajouté il y a plus de trente jours, vers lequel
 * AUCUNE colonne de la base ne pointe. Les trente jours ne sont pas décoratifs :
 * on dépose souvent un fichier avant de l'utiliser, et un balayage immédiat
 * effacerait le visuel qu'on s'apprêtait à poser.
 *
 * CE QU'IL NE SUPPRIME PAS. Tout ce qui est référencé, y compris depuis un
 * BROUILLON — les tables de versions comptent comme un usage.
 *
 * COMMENT IL SAIT. Les colonnes qui pointent vers `media` sont lues dans le
 * catalogue de la base, jamais recopiées : une liste écrite à la main serait
 * fausse dès le prochain champ ajouté, et ce qu'on oublie d'interroger passerait
 * pour inutilisé — donc serait effacé. Si le catalogue ne rend rien, le
 * balayage s'ARRÊTE (voir conditionReferencee).
 *
 * `dry=1` : liste ce qui partirait, sans rien supprimer.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 30;
/** Plafond par exécution : le reste attend le lendemain. */
const BATCH = 50;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  const payload = await payloadClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (payload.db as any).drizzle;

  let condition: string;
  try {
    const refs = await db.execute(sql`
      select tc.table_name as table, kcu.column_name as column
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
      where tc.constraint_type = 'FOREIGN KEY' and ccu.table_name = 'media'`);
    condition = conditionReferencee((refs.rows ?? refs) as Reference[]);
  } catch (err) {
    // On ne devine pas : sans la liste des références, tout média paraîtrait
    // inutilisé. Mieux vaut ne rien faire aujourd'hui.
    payload.logger.error(`[medias] balayage annulé, références illisibles : ${err}`);
    return NextResponse.json({ error: "references_unavailable" }, { status: 503 });
  }

  /**
   * Second filet : le nom du fichier cité dans un texte libre.
   *
   * Une adresse d'image collée dans un modèle d'e-mail ou une note ne laisse
   * aucune clé étrangère. Sans ce filet, le média passerait pour inutilisé et
   * disparaîtrait — laissant une image cassée dans un message déjà envoyé.
   * Son absence n'est PAS bloquante, contrairement aux références.
   */
  let cite: string | null = null;
  try {
    const noms = COLONNES_TEXTE_LIBRE.map((n) => `'${n}'`).join(",");
    const cols = await db.execute(
      sql.raw(`select table_name as table, column_name as column
               from information_schema.columns
               where table_schema = 'public'
                 and data_type in ('text','character varying')
                 and column_name in (${noms})`),
    );
    cite = conditionCitee((cols.rows ?? cols) as Reference[]);
  } catch (err) {
    payload.logger.warn(`[medias] colonnes de texte libre illisibles, filet ignoré : ${err}`);
  }

  const inutilise = cite ? `not ((${condition}) or (${cite}))` : `not (${condition})`;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const orphelins = await db.execute(
    sql.raw(`
      select m.id, m.filename, coalesce(m.filesize, 0) as filesize
      from media m
      where m.created_at < '${cutoff}'::timestamptz and ${inutilise}
      order by m.filesize desc nulls last
      limit ${BATCH}`),
  );
  const lignes = ((orphelins.rows ?? orphelins) as { id: number; filename: string; filesize: number }[]) ?? [];

  const supprimes: string[] = [];
  const echecs: string[] = [];
  let octets = 0;

  for (const m of lignes) {
    if (dry) {
      supprimes.push(m.filename);
      octets += Number(m.filesize) || 0;
      continue;
    }
    try {
      // `payload.delete` retire AUSSI le fichier du stockage (hook de
      // l'adaptateur). Une suppression en base seule laisserait le fichier
      // payé et orphelin sur le CDN.
      await payload.delete({ collection: "media", id: m.id, overrideAccess: true });
      supprimes.push(m.filename);
      octets += Number(m.filesize) || 0;
    } catch (err) {
      echecs.push(m.filename);
      payload.logger.error(`[medias] suppression de « ${m.filename} » échouée : ${err}`);
    }
  }

  payload.logger.info(
    `[medias] balayage : ${lignes.length} orphelin(s) de plus de ${RETENTION_DAYS} jours, ` +
      `${supprimes.length} supprimé(s)${dry ? " (à blanc)" : ""}` +
      `${echecs.length ? `, ${echecs.length} échec(s)` : ""}.`,
  );

  return NextResponse.json({
    ok: true,
    dry,
    trouves: lignes.length,
    supprimes,
    echecs,
    octetsLiberes: octets,
  });
}
