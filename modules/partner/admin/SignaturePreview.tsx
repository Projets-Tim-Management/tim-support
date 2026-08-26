"use client";

import { useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { renderSignature } from "@/modules/partner/lib/signature";

/**
 * Aperçu de la signature, sous ses champs.
 *
 * Il appelle la MÊME fonction que l'envoi (`renderSignature`) : ce qu'on voit
 * ici est exactement ce qui partira, et non une maquette qui dériverait à la
 * première modification du gabarit.
 *
 * La PHOTO demande un aller-retour : dans l'état du formulaire, un champ
 * `upload` ne vaut qu'un identifiant — pas une URL. Sans cette résolution,
 * l'aperçu montrait une signature sans image alors que l'e-mail réel en avait
 * une : le pire cas, puisqu'on corrige alors un problème qui n'existe pas.
 *
 * L'HTML injecté est celui que NOUS fabriquons à partir de champs échappés — ce
 * n'est pas la saisie de l'utilisateur qu'on réinjecte.
 */

/** `4` | `{ id: 4 }` | `{ url: "/media/x.jpg" }` → identifiant ou URL directe. */
function readUpload(value: unknown): { id?: string; url?: string } {
  if (value == null) return {};
  if (typeof value === "number" || typeof value === "string") return { id: String(value) };
  if (typeof value === "object") {
    const v = value as { id?: unknown; url?: unknown };
    if (typeof v.url === "string") return { url: v.url };
    if (v.id != null) return { id: String(v.id) };
  }
  return {};
}

export function SignaturePreview() {
  const values = useFormFields(([fields]) => ({
    displayName: fields?.displayName?.value as string | undefined,
    firstName: fields?.firstName?.value as string | undefined,
    lastName: fields?.name?.value as string | undefined,
    societe: fields?.societe?.value as string | undefined,
    jobTitle: fields?.signatureJobTitle?.value as string | undefined,
    company: fields?.signatureCompany?.value as string | undefined,
    phone: fields?.signaturePhone?.value as string | undefined,
    mobile: fields?.mobile?.value as string | undefined,
    website: fields?.signatureWebsite?.value as string | undefined,
    // Repli sur la photo de profil : la même règle qu'à l'envoi.
    photo: readUpload(fields?.signaturePhoto?.value ?? fields?.avatar?.value),
  }));

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const { id: photoId, url: directUrl } = values.photo;
  useEffect(() => {
    if (directUrl) {
      setPhotoUrl(directUrl);
      return;
    }
    if (!photoId) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/payload-api/media/${photoId}?depth=0`, { credentials: "include" });
        const json = res.ok ? await res.json() : null;
        if (!cancelled) setPhotoUrl((json?.url as string) ?? null);
      } catch {
        // Média illisible : l'aperçu se passe d'image, l'envoi la retrouvera.
        if (!cancelled) setPhotoUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [directUrl, photoId]);

  const full = [values.firstName, values.lastName].filter(Boolean).join(" ").trim();
  const html = renderSignature({
    name: full || values.displayName || values.societe || null,
    jobTitle: values.jobTitle ?? null,
    company: values.company ?? values.societe ?? null,
    phone: values.phone ?? values.mobile ?? null,
    website: values.website ?? null,
    photoUrl,
  });

  return (
    <div className="tim-sig">
      <span className="tim-sig__label">Aperçu</span>
      {html ? (
        <div className="tim-sig__box" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="tim-sig__empty">
          Renseignez au moins le nom de la fiche pour voir la signature.
        </p>
      )}
      <p className="tim-sig__hint">
        {photoUrl
          ? "La signature s'ajoute automatiquement au bas des e-mails envoyés depuis une opportunité."
          : "Aucune photo : ajoutez-en une ci-dessus, ou la photo de profil de la fiche sera utilisée. Enregistrez la fiche pour qu'une image tout juste déposée apparaisse ici."}
      </p>
    </div>
  );
}
