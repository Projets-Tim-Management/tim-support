import { describe, expect, it } from "vitest";

import { platformKind } from "@/modules/dev/lib/platforms";

/**
 * Le signe affiché pour une plateforme sur une carte du Kanban.
 *
 * Les libellés sont du contenu : quelqu'un peut renommer « Mobile » en
 * « Application mobile » sans toucher au code. La reconnaissance doit donc
 * tenir sur le sens du mot, et ce qu'elle ne reconnaît pas doit rester visible.
 */

describe("reconnaissance", () => {
  it("reconnaît le web sous ses formes courantes", () => {
    expect(platformKind("Web")).toBe("web");
    expect(platformKind("Application web")).toBe("web");
    expect(platformKind("Navigateur")).toBe("web");
  });

  it("reconnaît le mobile, y compris renommé", () => {
    expect(platformKind("Mobile")).toBe("mobile");
    expect(platformKind("Application mobile")).toBe("mobile");
    expect(platformKind("Mobile iOS")).toBe("mobile");
    expect(platformKind("Tablette Android")).toBe("mobile");
  });

  it("ignore la casse et les accents", () => {
    expect(platformKind("MOBILE")).toBe("mobile");
    expect(platformKind("Tablétte")).toBe("mobile");
  });

  it("ne confond pas un mot qui CONTIENT « web »", () => {
    // « Webhooks » n'est pas une plateforme web.
    expect(platformKind("Webhooks")).toBe("other");
  });

  it("garde un signe neutre pour ce qu'elle ne connaît pas", () => {
    expect(platformKind("Borne d'atelier")).toBe("other");
    expect(platformKind("")).toBe("other");
  });
});
