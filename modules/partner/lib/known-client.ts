import type { Payload, Where } from "payload";

import { phoneDigits } from "@/core/lib/phone";
import { idOf } from "@/core/lib/relations";

/**
 * Cette entreprise est-elle DÉJÀ suivie ? Une fiche, chez n'importe quel
 * partenaire, qui porte la même adresse ou le même numéro — sur la fiche ou
 * sur l'un de ses contacts.
 *
 * Chercher chez tous les partenaires, et pas seulement chez celui du site
 * vitrine : une entreprise suivie par un partenaire qui remplit le formulaire
 * du site produisait sinon une seconde fiche, que personne ne rapprochait
 * (Laurin Électricité, 26/10/2026).
 *
 * Les contacts comptent autant que la fiche : la personne qui écrit n'est pas
 * toujours celle dont l'adresse est sur la fiche, mais c'est souvent un contact
 * déjà connu. Le téléphone se compare en chiffres nationaux (`phoneDigits`),
 * « +33 6 50… » et « 06 50… » sont le même numéro.
 *
 * Une fiche ARCHIVÉE ne sert de point de chute qu'en dernier recours : y
 * rattacher une demande la cacherait du Kanban. Elle n'est pas retenue — la
 * demande crée alors une fiche neuve, qu'on peut fusionner si besoin.
 */

export type KnownClient = {
  id: number | string;
  companyName: string | null;
  partner: number | string | null;
};

type Row = {
  id: number | string;
  companyName?: string | null;
  partner?: unknown;
  email?: string | null;
  phoneDigits?: string | null;
};

const OPEN: Where = { clientStatus: { not_equals: "archive" } };

export async function findKnownClient(
  payload: Payload,
  probe: { email?: string | null; phone?: string | null },
  opts: { exclude?: number | string } = {},
): Promise<KnownClient | null> {
  const email = probe.email?.trim().toLowerCase() || null;
  const digits = phoneDigits(probe.phone);
  // Un numéro trop court rapprocherait des inconnus (un standard « 3949 »…).
  const phone = digits.length >= 9 ? digits : null;
  if (!email && !phone) return null;

  const notSelf: Where[] = opts.exclude != null ? [{ id: { not_equals: opts.exclude } }] : [];
  /**
   * L'e-mail se cherche en `like` (insensible à la casse) puis se vérifie ici À
   * L'IDENTIQUE : « Contact@Laurin.fr » saisi à la main est la même adresse que
   * « contact@laurin.fr » du formulaire, mais `like` seul rapprocherait aussi
   * « jp@x.fr » de « ajp@x.fr ».
   */
  const same = (r: { email?: string | null; phoneDigits?: string | null }) =>
    (email != null && r.email?.trim().toLowerCase() === email) || (phone != null && r.phoneDigits === phone);
  const pick = (rows: Row[]): KnownClient | null => {
    const row = rows[0];
    return row
      ? {
          id: row.id,
          companyName: row.companyName ?? null,
          partner: idOf(row.partner),
        }
      : null;
  };

  // Même critère sur la fiche et sur ses contacts.
  const byEmailOrPhone: Where[] = [];
  if (email) byEmailOrPhone.push({ email: { like: email } });
  if (phone) byEmailOrPhone.push({ phoneDigits: { equals: phone } });

  // 1. La fiche elle-même.
  const direct = await payload.find({
    collection: "partner-clients",
    where: { and: [{ or: byEmailOrPhone }, OPEN, ...notSelf] },
    sort: "-updatedAt",
    limit: 20,
    depth: 0,
    overrideAccess: true,
  });
  const found = pick((direct.docs as Row[]).filter(same));
  if (found) return found;

  // 2. L'un de ses contacts.
  const contacts = await payload.find({
    collection: "client-contacts",
    where: { or: byEmailOrPhone },
    limit: 20,
    depth: 0,
    overrideAccess: true,
  });
  const ids = [
    ...new Set(
      (
        contacts.docs as {
          client?: unknown;
          email?: string | null;
          phoneDigits?: string | null;
        }[]
      )
        .filter(same)
        .map((c) => idOf(c.client))
        .filter((v) => v != null),
    ),
  ];
  if (!ids.length) return null;
  const owners = await payload.find({
    collection: "partner-clients",
    where: { and: [{ id: { in: ids } }, OPEN, ...notSelf] },
    sort: "-updatedAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return pick(owners.docs as Row[]);
}
