import { readFileSync } from "node:fs";

import { sql } from "@payloadcms/db-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Payload } from "payload";
import { describe, expect, it } from "vitest";

import { incrementVue, parisDay } from "@/modules/analytics/lib/video-views";

/**
 * L'incrément atomique, contre la VRAIE base : deux lectures simultanées
 * doivent donner `nombre = 2`. La base est partagée avec la prod — le test ne
 * tourne qu'à la demande (`RUN_DB_TESTS=1 npx vitest run tests/video-views.db.test.ts`),
 * jamais dans la suite par défaut, et efface ses lignes en partant.
 */
const dbUrl = (): string | undefined => {
  try {
    const line = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
    return line?.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
};

describe.skipIf(!process.env.RUN_DB_TESTS)("video_views en base", () => {
  it("deux incréments simultanés donnent nombre = 2 (même appareil, même canal)", async () => {
    const pool = new pg.Pool({ connectionString: dbUrl(), max: 2 });
    const db = drizzle(pool);
    const payload = { db: { drizzle: db } } as unknown as Payload;
    const vue = { videoId: `test-vitest-${Date.now()}`, etape: "lecture" as const, page: "/test", appareil: "mobile", canal: "sea" };
    try {
      await Promise.all([incrementVue(payload, vue), incrementVue(payload, vue)]);
      const r = await db.execute(sql`SELECT "nombre" FROM "video_views" WHERE "video_id" = ${vue.videoId} AND "jour" = ${parisDay(new Date())}`);
      expect(r.rows).toHaveLength(1);
      expect(Number(r.rows[0].nombre)).toBe(2);
    } finally {
      await db.execute(sql`DELETE FROM "video_views" WHERE "video_id" LIKE 'test-vitest-%'`);
      await pool.end();
    }
  });
});
