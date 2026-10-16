"use client";

import { toast } from "@payloadcms/ui";
import { useState } from "react";

import { postAdmin } from "./post-admin";

/**
 * La vidéo d'une créa, sur sa carte (plan Publicité, §9 sexies, D3) : choisir
 * un style, lancer le montage, regarder le résultat aux trois formats. Le
 * montage part au prochain passage du cron (chaque minute) et prend quelques
 * minutes : la carte dit où il en est. Refaire dans un autre style (ou sur une
 * autre musique) remplace la vidéo de cette créa ; c'est l'agent qui produit
 * des variantes à comparer. Sur une musique analysée, les coupes tombent sur
 * les temps.
 */

export type CardVideo = {
  status: string | null;
  error: string | null;
  renders: { format: string; url: string }[];
  styleName: string | null;
  musicName?: string | null;
};
export type StyleOption = { id: number | string; name: string };
export type MusicOption = { id: number | string; name: string };

/** Le choix de musique : celle du Kit de marque (par défaut), aucune, ou une musique précise. */
const KIT = "";
const NONE = "aucune";

const FORMAT_LABEL: Record<string, string> = { "9x16": "9:16", "4x5": "4:5", "1x1": "1:1" };
const STATUS: Record<string, { label: string; tone: string }> = {
  "en-attente": { label: "En file : le montage démarre dans la minute", tone: "gris" },
  "en-cours": { label: "Montage en cours (quelques minutes)…", tone: "bleu" },
  prete: { label: "Vidéo prête", tone: "vert" },
  echec: { label: "Échec du montage", tone: "rouge" },
};

export function CreativeVideo({ id, video, styles, musics = [] }: { id: number | string; video: CardVideo | null; styles: StyleOption[]; musics?: MusicOption[] }) {
  const [style, setStyle] = useState<string>(String(styles[0]?.id ?? ""));
  const [music, setMusic] = useState<string>(KIT);
  const [format, setFormat] = useState<string>("9x16");
  const [busy, setBusy] = useState(false);
  const status = video?.status ? STATUS[video.status] : null;
  const shown = video?.renders.find((r) => r.format === format) ?? video?.renders[0] ?? null;

  const launch = async () => {
    setBusy(true);
    try {
      await postAdmin(`/api/admin/ads/creatives/${encodeURIComponent(String(id))}/video`, { styleId: Number(style) || style, ...(music === KIT ? {} : { music: music === NONE ? null : Number(music) }) });
      toast.success("Montage lancé : la vidéo arrive dans quelques minutes. Rechargez la page pour la voir.");
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  const running = video?.status === "en-attente" || video?.status === "en-cours";

  return (
    <section className="ads-video" aria-label="Vidéo">
      <header className="ads-video__head">
        <strong>Vidéo</strong>
        {status && <span className={`tim-status-pill ads-rush-stage ads-rush-stage--${status.tone}`}>{status.label}</span>}
        {video?.styleName && <span className="ads-video__style">Style : {video.styleName}</span>}
        {video?.status && <span className="ads-video__style">{video.musicName ? `Musique : ${video.musicName}` : "Sans musique"}</span>}
      </header>
      {video?.status === "echec" && video.error && <p className="ads-video__error">{video.error}</p>}
      {shown && (
        <div className="ads-video__player">
          <video key={shown.url} src={shown.url} controls playsInline preload="metadata" className={`ads-video__media ads-video__media--${shown.format}`} />
          <div className="ads-video__formats" role="tablist" aria-label="Format">
            {video!.renders.map((r) => (
              <button key={r.format} type="button" role="tab" aria-selected={r.format === shown.format} className={`tim-btn${r.format === shown.format ? " tim-btn--primary" : ""}`} onClick={() => setFormat(r.format)}>
                {FORMAT_LABEL[r.format] ?? r.format}
              </button>
            ))}
          </div>
        </div>
      )}
      {styles.length > 0 ? (
        <div className="ads-video__launch">
          <select value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Style de la vidéo" disabled={busy || running}>
            {styles.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={music} onChange={(e) => setMusic(e.target.value)} aria-label="Musique de la vidéo" disabled={busy || running}>
            <option value={KIT}>Musique du Kit de marque</option>
            {musics.map((m) => (
              <option key={String(m.id)} value={String(m.id)}>
                {m.name}
              </option>
            ))}
            <option value={NONE}>Sans musique</option>
          </select>
          <button type="button" className="tim-btn" disabled={busy || running || !style} onClick={launch}>
            {busy ? "…" : video?.renders.length ? "Refaire la vidéo" : "Monter en vidéo"}
          </button>
        </div>
      ) : (
        <p className="ads-video__error">Aucun style actif : activez-en un dans Publicité › Paramètres › Styles.</p>
      )}
    </section>
  );
}
