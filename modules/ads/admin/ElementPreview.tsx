"use client";

import { useFormFields } from "@payloadcms/ui";

/**
 * L'aperçu d'un élément (atelier des éléments) : une courte vidéo rendue dans
 * le moteur, l'élément sur le fond du style puis sur un rush flouté. Il se
 * refait tout seul après chaque enregistrement qui change les réglages.
 */
const LABEL: Record<string, { label: string; tone: string }> = {
  "en-attente": { label: "Aperçu en file : il se rend dans la minute", tone: "gris" },
  "en-cours": { label: "Aperçu en cours de rendu…", tone: "bleu" },
  pret: { label: "Aperçu à jour", tone: "vert" },
  echec: { label: "Échec du rendu de l'aperçu", tone: "rouge" },
};

export function ElementPreview() {
  const status = useFormFields(([f]) => f?.["preview.status"]?.value as string | undefined);
  const video = useFormFields(([f]) => f?.["preview.videoUrl"]?.value as string | undefined);
  const error = useFormFields(([f]) => f?.["preview.error"]?.value as string | undefined);
  const st = status ? LABEL[status] : null;
  return (
    <section className="ads-elpreview" aria-label="Aperçu">
      <div className="ads-elpreview__head">
        <strong>Aperçu</strong>
        {st && <span className={`tim-status-pill ads-rush-stage ads-rush-stage--${st.tone}`}>{st.label}</span>}
      </div>
      {video ? <video key={video} src={video} controls loop autoPlay muted playsInline className="ads-elpreview__video" /> : <p className="ads-elpreview__empty">Pas encore d&apos;aperçu : enregistrez l&apos;élément.</p>}
      {status === "echec" && error && <p className="ads-video__error">{error}</p>}
    </section>
  );
}
