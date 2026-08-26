import { BORDER, FONT, SITE_URL, escape } from "@/core/lib/email-template";

/**
 * Signature d'e-mail d'un partenaire : photo, nom, fonction, coordonnées.
 *
 * Fabriquée ICI, à partir de champs, plutôt que saisie en HTML par chacun :
 *  - une signature écrite à la main finit par contenir des polices absentes,
 *    des images sur un serveur qui tombe et des tableaux cassés sur mobile ;
 *  - à partir de champs, elle reste juste quand un numéro change — on modifie
 *    une ligne de la fiche, pas dix modèles d'e-mail.
 *
 * Rendu en TABLEAU et en styles en ligne : c'est le seul HTML que les clients de
 * messagerie affichent de la même façon. Flexbox et feuilles de style externes
 * n'y survivent pas.
 *
 * Pur (aucune base, aucun envoi) : ce qui est testé est exactement ce qui part.
 */

export type PartnerSignature = {
  /** Nom affiché — celui de la fiche partenaire. */
  name?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  phone?: string | null;
  website?: string | null;
  /** URL de la photo / du logo (absolue ou relative au site). */
  photoUrl?: string | null;
};

/** Couleurs de la signature : marine TIM, comme la charte de la capture. */
const NAVY = "#2b3150";
const INK = "#22242c";

/** Une image d'e-mail doit être joignable depuis n'importe quelle messagerie. */
const absolute = (url?: string | null): string | null => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
};

/** `Tim-management.co` → `https://tim-management.co` (lien cliquable). */
const websiteHref = (site: string): string =>
  /^https?:\/\//i.test(site) ? site : `https://${site.replace(/^\/+/, "")}`;

/**
 * Rend la signature, ou `""` si elle n'a rien à dire.
 *
 * Le seuil est le NOM : sans lui, une signature n'est qu'un bloc décoratif au
 * bas d'un message — mieux vaut ne rien mettre.
 */
export function renderSignature(sig: PartnerSignature): string {
  const name = sig.name?.trim();
  if (!name) return "";

  const role = [sig.jobTitle?.trim(), sig.company?.trim()].filter(Boolean).join(" | ");
  const photo = absolute(sig.photoUrl);
  const phone = sig.phone?.trim();
  const site = sig.website?.trim();

  const lines = [
    phone
      ? `<a href="tel:${escape(phone.replace(/[^\d+]/g, ""))}" style="color:${INK};text-decoration:none;">${escape(phone)}</a>`
      : null,
    site
      ? `<a href="${escape(websiteHref(site))}" style="color:${INK};text-decoration:none;">${escape(site)}</a>`
      : null,
  ].filter(Boolean);

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0;border-top:1px solid ${BORDER};padding-top:18px;">
  <tr>
    ${
      photo
        ? `<td style="padding-right:16px;vertical-align:middle;">
             <img src="${escape(photo)}" width="72" height="72" alt="${escape(name)}"
                  style="display:block;width:72px;height:72px;border-radius:50%;object-fit:cover;" />
           </td>`
        : ""
    }
    <td style="border-left:3px solid ${NAVY};padding-left:16px;vertical-align:middle;font-family:${FONT};">
      <p style="margin:0 0 6px;font-size:17px;font-weight:800;color:${NAVY};">${escape(name)}</p>
      ${
        role
          ? `<p style="margin:0 0 10px;"><span style="display:inline-block;padding:6px 12px;background:${NAVY};border-radius:6px;font-size:13px;font-weight:600;color:#ffffff;">${escape(role)}</span></p>`
          : ""
      }
      ${
        lines.length
          ? `<p style="margin:0;font-size:13px;line-height:1.7;color:${INK};">${lines.join("<br />")}</p>`
          : ""
      }
    </td>
  </tr>
</table>`;
}

/** Version texte, pour les clients qui n'affichent pas le HTML. */
export function signatureText(sig: PartnerSignature): string {
  const name = sig.name?.trim();
  if (!name) return "";
  return [
    name,
    [sig.jobTitle?.trim(), sig.company?.trim()].filter(Boolean).join(" | "),
    sig.phone?.trim(),
    sig.website?.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}
