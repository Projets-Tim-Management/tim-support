/**
 * CE QUE LES REVUES D'OCTOBRE 2026 ONT LAISSÉ SUR CHAQUE ARTICLE — repris des
 * bilans du pipeline Python (`~/claude/tim-management/docs/`, synthèse dans
 * docs/articles/inventaire-pipeline-python/lecons-des-bilans.md, § 4).
 *
 * Posé UNE fois, à l'import d'un article dans le tableau : ensuite, la fiche
 * vit sa vie (Charlie peut corriger ces champs). Clé = ID WordPress.
 *  - `lot` : le lot de correction sur le fond, et sa date ;
 *  - `keepSeoTitle` : titre SEO raccourci à la main le 07/10, à ne pas réécrire ;
 *  - `deadlines` : revérifications datées (articles du CGI abrogés au 01/01/2027,
 *    tarifs des concurrents chaque trimestre) ;
 *  - `redirectTo` : article retiré du site (doublon), redirigé en 301 vers cet ID.
 */
export type OctoberReview = {
  lot?: string;
  notes?: string;
  keepSeoTitle?: boolean;
  deadlines?: { date: string; reason: string }[];
  redirectTo?: number;
};

const CGI_2027 = { date: "2027-01-05", reason: "Articles du CGI abrogés au 01/01/2027 : vérifier et mettre à jour." };
const TARIFS_CONCURRENTS = { date: "2027-01-05", reason: "Tarifs des concurrents : revérifier sur leur site (chaque trimestre)." };

export const OCTOBER_REVIEW: Record<number, OctoberReview> = {
  // Première remise au format (34), 10-12/10/2026
  7085: { lot: "Dernier lot 09/10", notes: "Mention hors ligne retirée." },
  7044: { lot: "Dernier lot 09/10", notes: "Mention hors ligne retirée." },
  6926: { lot: "Dernier lot 09/10" },
  6937: { lot: "Dernier lot 09/10" },
  6959: { lot: "Dernier lot 09/10" },
  7070: { lot: "Dernier lot 10/10" },
  7059: { lot: "Vérification complète 10/10", keepSeoTitle: true },
  6874: { lot: "Lot moyen 08/10" },
  6878: { lot: "Lot moyen 08/10" },
  6870: { lot: "Lot moyen 08/10" },
  6876: { lot: "Lot moyen 08/10", keepSeoTitle: true, deadlines: [CGI_2027] },
  6875: { lot: "Lot moyen 08/10" },
  6877: { lot: "Dernier lot 10/10", deadlines: [{ date: "2027-01-05", reason: "Vérifier l'article 1727 du CGI (intérêt de retard) après le 01/01/2027." }] },
  4274: { lot: "Articles gardés 07/10" },
  6595: { lot: "Articles gardés 07/10", notes: "Bloc Vertuoza en code court [caption] : le garder tel quel. 3 écarts de format acceptés.", deadlines: [TARIFS_CONCURRENTS] },
  4231: { lot: "Lot grave 07/10 + lot moyen 08/10" },
  4208: { lot: "Lot moyen 08/10" },
  5273: { lot: "Lot moyen 08/10" },
  3498: { lot: "Dernier lot 09/10", notes: "Publié sans source (aucun chiffre)." },
  3520: { lot: "Dernier lot 09/10" },
  6739: { lot: "Dernier lot 10/10", notes: "SMIC 12,31 € (depuis le 01/06/2026)." },
  3469: { lot: "Dernier lot 10/10" },
  3516: { lot: "Dernier lot 10/10" },
  5226: { lot: "Dernier lot 10/10" },
  4250: { lot: "Dernier lot 10/10", keepSeoTitle: true },
  4570: { lot: "Dernier lot 10/10" },
  5051: { lot: "Dernier lot 10/10", notes: "Image 5053 laissée telle quelle (décision de Charlie)." },
  2725: { lot: "Dernier lot 10/10" },
  3568: { lot: "Dernier lot 10/10" },
  3963: { lot: "Dernier lot 10/10", notes: "Modèles .docx/.pdf publiés (médias 7380, 7381)." },
  4119: { lot: "Dernier lot 10/10", notes: "Formulation « opération » / « contrat » arbitrée : conservée." },
  4166: { lot: "Dernier lot 10/10" },
  4213: { lot: "Dernier lot 10/10", keepSeoTitle: true },
  4239: { lot: "Dernier lot 10/10", keepSeoTitle: true, deadlines: [TARIFS_CONCURRENTS] },
  // Seconde remise au format (29), 12/10/2026
  6989: { lot: "Articles gardés 07/10", deadlines: [{ date: "2027-01-05", reason: "Vérifier l'article 81 du CGI après le 01/01/2027." }] },
  7088: { lot: "Lot grave 06/10" },
  7089: { lot: "Lot grave 06/10" },
  7039: { lot: "Articles gardés 07/10" },
  7032: { lot: "Articles gardés 07/10", notes: "Barème kilométrique 2026 non confirmé : l'article le dit." },
  6988: { lot: "Articles gardés 07/10", notes: "Tableau Excel publié le 10/10 (média 7379)." },
  6905: { lot: "Lot moyen 08/10" },
  6906: { lot: "Lot moyen 08/10" },
  6917: { lot: "Lot moyen 08/10" },
  6935: { lot: "Lot moyen 08/10" },
  6936: { lot: "Lot moyen 08/10" },
  6938: { lot: "Lot moyen 08/10" },
  6939: { lot: "Lot moyen 08/10" },
  6946: { lot: "Lot moyen 08/10" },
  6958: { lot: "Lot moyen 08/10" },
  7017: { lot: "Lot moyen 08/10" },
  7018: { lot: "Articles gardés 07/10" },
  7027: { lot: "Lot moyen 08/10" },
  7031: { lot: "Lot grave 07/10 + lot moyen 08/10" },
  7037: { lot: "Lot moyen 08/10" },
  7040: { lot: "Lot moyen 08/10" },
  7053: { lot: "Articles gardés 07/10" },
  7060: { lot: "Lot moyen 08/10", keepSeoTitle: true },
  7064: { lot: "Articles gardés 07/10" },
  7081: { lot: "Lot moyen 09/10" },
  7082: { lot: "Articles gardés 07/10 + rattrapage 08/10" },
  7083: { lot: "Articles gardés 07/10 + rattrapage 08/10" },
  7086: { lot: "Lot grave 07/10 + lot moyen 08/10" },
  7087: { lot: "Lot grave 07/10" },
  // Doublons retirés du site (301 puis brouillon), 07-10/10/2026
  6869: { redirectTo: 7083 },
  3970: { redirectTo: 7082 },
  5064: { redirectTo: 7064 },
  5100: { redirectTo: 7053 },
  3548: { redirectTo: 6989 },
  4125: { redirectTo: 7018 },
  5060: { redirectTo: 7039 },
  6872: { redirectTo: 7039 },
  6888: { redirectTo: 7039 },
  3528: { redirectTo: 6595 },
  6871: { redirectTo: 7032 },
  6864: { redirectTo: 4274 },
  3563: { redirectTo: 6988 },
  7016: { redirectTo: 7027, notes: "Article entier sur le pointage hors ligne (fonction inexistante)." },
};

/** L'ID est-il celui d'un article retiré du site en octobre (doublon redirigé) ? */
export const isKnownUnpublished = (wpId: number) => OCTOBER_REVIEW[wpId]?.redirectTo != null;
