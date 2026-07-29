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
    include: ["tests/**/*.test.ts"],
  },
});
