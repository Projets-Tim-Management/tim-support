import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
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
