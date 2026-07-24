import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 60 * 60 * 24 * 31,
    remotePatterns: [
      { protocol: "https", hostname: "tim-management.co" },
      { protocol: "https", hostname: "cms.tim-management.co" },
      { protocol: "https", hostname: "support-tim-management.co" },
    ],
  },
};

// withPayload monte le back-office (/admin) et l'API Payload dans l'app Next.
export default withPayload(nextConfig);
