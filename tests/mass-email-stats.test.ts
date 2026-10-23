import { describe, expect, it } from "vitest";

import { computeCampaignStats } from "@/modules/marketing/lib/mass-email-stats";
import { parseRecipients, personalize } from "@/modules/marketing/lib/mass-email";

describe("statistiques d'une campagne d'e-mail de masse", () => {
  const sentTo = ["a@x.fr", "b@x.fr", "c@x.fr", "d@x.fr"];
  const ev = (event: string, email: string, link?: string) => ({ event, email, date: "2026-10-23T10:00:00Z", link });

  const stats = computeCampaignStats(
    [
      ev("delivered", "a@x.fr"),
      ev("opened", "a@x.fr"),
      ev("opened", "a@x.fr"), // deux ouvertures, une personne
      ev("delivered", "b@x.fr"),
      ev("clicks", "b@x.fr", "https://support.tim-management.co/app-mobile-v2"), // clic sans image chargée
      ev("delivered", "c@x.fr"),
      ev("proxyOpen", "c@x.fr"), // Apple Mail : pas une lecture
      ev("hardBounces", "d@x.fr"),
    ],
    sentTo,
  );

  it("compte des personnes, pas des événements", () => {
    expect(stats.sent).toBe(4);
    expect(stats.delivered).toBe(3);
    expect(stats.opened).toBe(2);
    expect(stats.clicked).toBe(1);
    expect(stats.bounced).toBe(1);
  });

  it("rapporte les taux aux délivrés et met les ouvertures Apple à part", () => {
    expect(stats.openRate).toBe(66.7);
    expect(stats.clickRate).toBe(33.3);
    expect(stats.proxyOpened).toBe(1);
  });

  it("détaille les clics par lien", () => {
    expect(stats.links).toEqual([{ url: "https://support.tim-management.co/app-mobile-v2", clicks: 1, people: 1 }]);
  });

  it("n'a pas de taux tant que rien n'est délivré", () => {
    expect(computeCampaignStats([], ["a@x.fr"]).openRate).toBeNull();
  });
});

describe("destinataires et personnalisation", () => {
  it("lit les adresses collées, garde le prénom, retire les doublons", () => {
    const { valid, invalid } = parseRecipients('Jean Dupont <Jean@Acme.fr>, marie@btp.fr; marie@btp.fr\nnope');
    expect(valid).toEqual([
      { email: "jean@acme.fr", firstName: "Jean" },
      { email: "marie@btp.fr", firstName: null },
    ]);
    expect(invalid).toEqual(["nope"]);
  });

  it("retire {{prenom}} proprement quand on ne le connaît pas", () => {
    expect(personalize("Bonjour {{prenom}},", "Jean")).toBe("Bonjour Jean,");
    expect(personalize("Bonjour {{prenom}},", null)).toBe("Bonjour,");
  });
});
