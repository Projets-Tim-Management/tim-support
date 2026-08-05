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
