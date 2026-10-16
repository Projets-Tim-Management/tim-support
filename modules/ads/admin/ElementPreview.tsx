"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { ElementLivePreview } from "./ElementLivePreview";
import { useAtelierContext } from "./useAtelierContext";

/**
 * L'aperçu d'un élément (atelier des éléments) : une courte vidéo rendue dans
 * le moteur, l'élément sur le fond du style puis sur un rush flouté. Il se
 * refait après chaque enregistrement qui change les réglages ; tant qu'il se
 * rend, ce panneau relit son état toutes les 8 secondes et montre la nouvelle
 * vidéo dès qu'elle est prête, sans recharger la page.
 */
const LABEL: Record<string, { label: string; tone: string }> = {
  "en-attente": { label: "Nouvel aperçu en file : il se rend dans la minute", tone: "gris" },
  "en-cours": { label: "Nouvel aperçu en cours de rendu (environ une minute)…", tone: "bleu" },
  pret: { label: "Aperçu à jour", tone: "vert" },
  echec: { label: "Échec du rendu de l'aperçu", tone: "rouge" },
};

type Preview = { status?: string | null; videoUrl?: string | null; error?: string | null };

export function ElementPreview() {
  const { id } = useDocumentInfo();
  const atelier = useAtelierContext();
  const base = useFormFields(([f]) => f?.base?.value as string | undefined);
  const params = useFormFields(([f]) => (f?.params?.value as Record<string, unknown> | undefined) ?? {});
  const initial = useFormFields(([f]) => ({
    status: f?.["preview.status"]?.value as string | undefined,
    videoUrl: f?.["preview.videoUrl"]?.value as string | undefined,
    error: f?.["preview.error"]?.value as string | undefined,
  }));
  const [live, setLive] = useState<Preview | null>(null);
  // Un nouvel enregistrement remet l'aperçu « en attente » dans le formulaire : on repart de lui (et le suivi reprend),
  // au lieu de garder l'état lu la fois précédente.
  useEffect(() => setLive(null), [initial.status, initial.videoUrl]);
  const pv: Preview = live ?? initial;
  const pending = pv.status === "en-attente" || pv.status === "en-cours";

  useEffect(() => {
    if (!id || !pending) return;
    const t = setInterval(async () => {
      const r = await fetch(`/payload-api/ad-elements/${encodeURIComponent(String(id))}?depth=0`, { credentials: "include" }).catch(() => null);
      if (!r?.ok) return;
      const doc = (await r.json()) as { preview?: Preview };
      if (doc.preview) setLive(doc.preview);
    }, 8_000);
    return () => clearInterval(t);
  }, [id, pending]);

  const st = pv.status ? LABEL[pv.status] : null;
  return (
    <section className="ads-elpreview" aria-label="Aperçu">
      <div className="ads-elpreview__head">
        <strong>Aperçu</strong>
        {st && <span className={`tim-status-pill ads-rush-stage ads-rush-stage--${st.tone}`}>{st.label}</span>}
      </div>
      <div className="ads-elpreview__panes">
        <figure className="ads-elpreview__pane">
          {atelier && base ? <ElementLivePreview ctx={atelier} base={base} id={Number(id) || 0} params={params} /> : <div className="ads-elpreview__loading">Chargement…</div>}
          <figcaption>
            <strong>En direct</strong> — avec vos réglages, même non enregistrés. Rien n&apos;est rendu ni payé.
          </figcaption>
        </figure>
        <figure className="ads-elpreview__pane">
          {pv.videoUrl ? <video key={pv.videoUrl} src={pv.videoUrl} controls loop autoPlay muted playsInline className="ads-elpreview__video" /> : <div className="ads-elpreview__loading">Pas encore de vidéo enregistrée.</div>}
          <figcaption>
            <strong>Vidéo enregistrée</strong> — rendue après chaque enregistrement, telle qu&apos;elle sortira dans les pubs.
          </figcaption>
        </figure>
      </div>
      {pv.status === "echec" && pv.error && <p className="ads-video__error">{pv.error}</p>}
    </section>
  );
}
