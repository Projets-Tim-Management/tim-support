import { registerRoot } from "remotion";

import { RemotionRoot } from "./Root";

/**
 * Le projet vidéo des pubs (plan Publicité, §9 sexies, D3) : compilé au build
 * (`npm run build:video`), déposé dans une Sandbox Vercel et rendu par
 * @remotion/vercel. Il ne lit rien en base : tout arrive dans ses propriétés
 * (modules/ads/video/props.ts).
 */
registerRoot(RemotionRoot);
