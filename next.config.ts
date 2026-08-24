import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
  /**
   * Prérendu limité à 2 processus.
   *
   * Les pages `/features/*` et `/parcours/*` sont générées à la compilation et
   * chacune initialise Payload, donc un pool de connexions. Avec le parallélisme
   * par défaut (un worker par cœur), le pooler Supabase — plafonné à 15 clients —
   * sature et le build échoue sur « max clients reached in session mode ».
   *
   * Va de pair avec la taille de pool réduite pendant le build (payload.config).
   */
  experimental: {
    cpus: 2,
  },
  /**
   * `sharp` est chargé au démarrage par la configuration Payload (redimension
   * des médias). C'est une bibliothèque NATIVE : à côté du JavaScript, elle
   * embarque un `.so` compilé pour la plateforme.
   *
   * Next n'embarque dans la fonction déployée que les fichiers qu'il a tracés.
   * Le jour où l'application et Next ont chacun leur version de `sharp`, Next
   * trace la sienne, l'application charge l'autre à l'exécution — et le `.so`
   * manque. Le serveur meurt AVANT de router : toutes les routes rendent 500,
   * y compris celles qui n'ont jamais touché une image. C'est ce qui est arrivé
   * le 24/08/2026 (libvips-cpp.so.8.18.3 introuvable).
   *
   * Les deux garde-fous, volontairement redondants :
   *  - `sharp` est épinglé sur la version que Next embarque (package.json), ce
   *    qui supprime le doublon à la racine du problème ;
   *  - les binaires natifs sont explicitement inclus ici, pour que le jour où
   *    les versions se désalignent de nouveau, le fichier suive quand même.
   *
   * Les motifs qui ne correspondent à rien sont ignorés : en local (macOS), les
   * dossiers `linux-x64` n'existent pas et ces lignes ne coûtent rien.
   */
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
    ],
  },
  images: {
    minimumCacheTTL: 60 * 60 * 24 * 31,
    remotePatterns: [
      // Médias servis depuis Vercel Blob (CDN).
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

// withPayload monte le back-office (/admin) et l'API Payload dans l'app Next.
export default withPayload(nextConfig);
