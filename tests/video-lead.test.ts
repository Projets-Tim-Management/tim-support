import { describe, expect, it } from "vitest";

import { buildVideoLeads } from "@/modules/analytics/lib/video-views";
import { parseAttribution } from "@/modules/forms/lib/ingest";
import { parseVideoLead, videoLeadLine, videoName } from "@/modules/forms/lib/video-lead";

describe("champs vidéo de la demande de démo", () => {
  it("lit les trois champs valides (snake_case, chaînes)", () => {
    expect(parseAttribution({ video_id: "planning-ouvriers-demo", video_pourcentage: "100", video_cta: "fin" })).toMatchObject({
      videoId: "planning-ouvriers-demo",
      videoPourcentage: "100",
      videoCta: "fin",
    });
  });

  it("ignore les valeurs invalides sans rejeter le reste", () => {
    expect(parseVideoLead({ video_id: "planning-ouvriers-demo", video_pourcentage: "60", video_cta: "milieu" })).toEqual({ videoId: "planning-ouvriers-demo" });
    expect(parseVideoLead({ video_id: "planning-ouvriers-demo", video_pourcentage: 25 })).toEqual({ videoId: "planning-ouvriers-demo" });
    expect(parseAttribution({ video_id: "Planning Demo", video_pourcentage: "50", utm_source: "google" })).toEqual(
      expect.not.objectContaining({ videoId: expect.anything(), videoPourcentage: expect.anything() }),
    );
  });

  it("ne garde rien sans vidéo", () => {
    expect(parseVideoLead({})).toEqual({});
    expect(parseVideoLead({ video_pourcentage: "100", video_cta: "fin" })).toEqual({});
    const a = parseAttribution({ utm_source: "google" });
    expect(a.videoId).toBeUndefined();
  });

  it("rédige la ligne de la fiche prospect", () => {
    expect(videoLeadLine({ videoId: "planning-ouvriers-demo", videoPourcentage: "100", videoCta: "fin" })).toBe(
      "A regardé la démo planning en entier — demande ouverte depuis l'écran de fin",
    );
    expect(videoLeadLine({ videoId: "pointage-demo", videoPourcentage: "50" })).toBe("A regardé la démo pointage jusqu'à 50 %");
    expect(videoLeadLine({ videoId: "pointage-demo", videoPourcentage: "75", videoCta: "pause" })).toBe(
      "A regardé la démo pointage jusqu'à 75 % — demande ouverte depuis la pause",
    );
    expect(videoLeadLine({ videoId: "pointage-demo", videoPourcentage: "0" })).toBe("A ouvert la démo pointage sans la lancer");
    expect(videoLeadLine({})).toBeNull();
  });

  it("nomme les vidéos, leurs versions et les inconnues", () => {
    expect(videoName("planning-ouvriers-demo-v2")).toBe("la démo planning (version 2)");
    expect(videoName("nouvelle-demo")).toBe("la vidéo nouvelle-demo");
  });
});

describe("demandes de démo par vidéo", () => {
  const since = "2026-10-01T00:00:00.000Z";
  it("compte les demandes, leur origine, leur profondeur et leur devenir", () => {
    const leads = buildVideoLeads(
      [
        { id: 1, videoId: "planning-ouvriers-demo", videoPourcentage: "100", videoCta: "fin", createdAt: "2026-10-10T10:00:00Z" },
        { id: 2, videoId: "planning-ouvriers-demo", videoPourcentage: "50", videoCta: "pause", createdAt: "2026-10-11T10:00:00Z" },
        { id: 3, videoId: "planning-ouvriers-demo", videoPourcentage: "25", createdAt: "2026-10-12T10:00:00Z" },
        { id: 4, videoId: "planning-ouvriers-demo", videoPourcentage: "100", createdAt: "2026-09-12T10:00:00Z" },
        { id: 5, videoId: null, createdAt: "2026-10-12T10:00:00Z" },
      ],
      [
        { formSubmission: 1, clientStatus: "actif", caPaye: 320 },
        { formSubmission: { id: 2 }, clientStatus: "en-test", caPaye: 0 },
      ],
      since,
    );
    expect(leads.get("planning-ouvriers-demo")).toEqual({
      videoId: "planning-ouvriers-demo",
      demandes: 3,
      depuisFin: 1,
      depuisPause: 1,
      parPourcentage: { "100": 1, "50": 1, "25": 1 },
      clientes: 1,
      caPaye: 320,
    });
    expect(leads.size).toBe(1);
  });
});
