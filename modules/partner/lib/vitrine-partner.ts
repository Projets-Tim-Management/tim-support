import type { Payload } from "payload";

/**
 * Fiche partenaire qui porte les leads du site vitrine.
 *
 * Les formulaires du site n'ont pas d'apporteur : c'est donc toujours le même
 * compte. Résolu par le LIEN STABLE compte → fiche (`users.partner`), avec repli
 * sur l'e-mail — la même règle que partout ailleurs, pour ne pas créer un second
 * partenaire le jour où une adresse diverge.
 *
 * Vit ici et non dans `brevo-import` : cette logique survit à la coupure de
 * Brevo, le module d'import non.
 */
const VITRINE_EMAIL = (
  process.env.VITRINE_PARTNER_EMAIL ??
  process.env.BREVO_LEADS_PARTNER_EMAIL ??
  "cpiancatelli@tim-management.co"
)
  .trim()
  .toLowerCase();

export const vitrinePartnerEmail = () => VITRINE_EMAIL;

export async function vitrinePartnerId(payload: Payload): Promise<number | string | null> {
  const users = await payload.find({
    collection: "users",
    where: { email: { equals: VITRINE_EMAIL } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const linked = (users.docs[0] as { partner?: unknown } | undefined)?.partner;
  const id = linked && typeof linked === "object" ? (linked as { id?: unknown }).id : linked;
  if (id != null) return id as number | string;

  const partners = await payload.find({
    collection: "partners",
    where: { email: { equals: VITRINE_EMAIL } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (partners.docs[0]?.id as number | string | undefined) ?? null;
}
