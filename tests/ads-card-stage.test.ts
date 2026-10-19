import { describe, expect, it } from "vitest";

import { stageOf } from "@/modules/ads/lib/card-stage";

const brief = { kind: "video", formats: ["9x16"], durationSec: 18, rationale: null, prompt: "…", rushes: [], expectedFiles: ["C1-9x16.mp4"] };
const file = { format: "9x16", kind: "video", url: "u", filename: "C1-9x16.mp4", warnings: [] };

describe("ce qu'il reste à faire sur une créa", () => {
  it("créer, puis compléter les fichiers, puis valider", () => {
    expect(stageOf({ status: "a-valider", brief, files: [], missing: ["9:16 vidéo"] })).toBe("creer");
    expect(stageOf({ status: "a-valider", brief, files: [file], missing: ["4:5 vidéo"] })).toBe("importer");
    expect(stageOf({ status: "a-valider", brief, files: [file], missing: [] })).toBe("valider");
  });
  it("sans brief, validée, refusée", () => {
    expect(stageOf({ status: "a-valider", brief: null, files: [], missing: [] })).toBe("sans-brief");
    expect(stageOf({ status: "en-ligne", brief, files: [file], missing: [] })).toBe("validee");
    expect(stageOf({ status: "refusee", brief, files: [], missing: [] })).toBe("refusee");
  });
});
