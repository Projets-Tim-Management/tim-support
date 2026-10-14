import { Composition } from "remotion";

import type { RenderProps } from "../modules/ads/video/props";
import { Pub } from "./Pub";

/**
 * Une seule composition, « Pub » : ses dimensions et sa durée viennent de ses
 * propriétés (le format et la partition résolue). Les propriétés par défaut
 * sont un exemple pour le studio Remotion, jamais rendu en production.
 */
const EXAMPLE: RenderProps = {
  format: "9x16",
  width: 1080,
  height: 1920,
  fps: 30,
  style: {
    opening: "titre-mot-a-mot",
    background: "sombre",
    proof: "chiffre-geant",
    titleFont: "Archivo Black",
    bodyFont: "Archivo",
    titleUpper: true,
    phoneFrame: "maquette",
    zoomOnGesture: true,
    corners: "arrondis",
    graphics: [],
    pace: "dynamique",
    transitions: ["zoom"],
    subtitles: "mot-a-mot",
  },
  palette: { primary: "#252B59", accent: "#F05761", darkBg: "#252B59", lightBg: "#F6F9FC", textOnDark: "#FFFFFF", textOnLight: "#252B59" },
  logos: { light: null, dark: null, symbol: null },
  cta: "Essai gratuit 30 jours",
  url: "tim-management.co",
  showLogo: true,
  music: null,
  shots: [
    { kind: "ouverture", frames: 66, text: "Fini la ressaisie du vendredi.", highlight: "ressaisie", sub: null },
    {
      kind: "rush",
      frames: 135,
      src: "https://ytlg8jezeqmgptjq.public.blob.vercel-storage.com/ads/rushes/travail/1/travail-TNhpNeCgXol3CMR8EpXcqhO4suGsxV.mp4",
      srcAspect: 732 / 1510,
      fromSec: 0.5,
      playbackRate: 1,
      crop: { x: 0, y: 0, w: 1, h: 1 },
      cover: null,
      zoom: null,
      caption: "Vos équipes pointent sur leur téléphone.",
    },
    { kind: "preuve", frames: 45, value: "5 000", label: "plus de 5 000 utilisateurs dans le BTP", source: "Site tim-management.co" },
    { kind: "fin", frames: 75, line: "Les heures arrivent au bureau." },
  ],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Pub"
    component={Pub}
    defaultProps={EXAMPLE}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={321}
    calculateMetadata={({ props }) => ({
      width: props.width,
      height: props.height,
      fps: props.fps,
      durationInFrames: Math.max(1, props.shots.reduce((t, s) => t + s.frames, 0)),
    })}
  />
);
