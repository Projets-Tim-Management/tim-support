import path from "path";
import { fileURLToPath } from "url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // `@/…` → racine du repo (comme tsconfig paths), pour tester core/* & modules/*.
  resolve: {
    alias: { "@": dirname },
  },
  test: {
    environment: "node",
    // setup-isolation EN PREMIER : aucune variable du poste, aucun réseau réel
    // (voir le fichier). setup-tz : le banc tourne en UTC, comme Vercel.
    setupFiles: ["./tests/setup-isolation.ts", "./tests/setup-tz.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
