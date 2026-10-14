import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";

import { logoSummary, normId, parseLogoDocument } from "@/modules/ads/video/logo";

/** Le logo animable (plan Publicité, §9 sexies, L) : un SVG en calques nommés, découpé en éléments. */

const parse = (svg: string) => parseLogoDocument(new JSDOM(svg, { contentType: "image/svg+xml" }).window.document);

// Comme l'exporte Affinity Designer : un groupe racine transformé, des calques nommés par leur id.
const AFFINITY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#f33"/></linearGradient></defs>
  <g transform="matrix(1,0,0,1,10,0)">
    <g id="Symbole">
      <circle id="point-1" cx="10" cy="10" r="8" fill="#E30613"/>
      <circle id="point-2" cx="30" cy="10" r="8" fill="#E30613"/>
      <circle id="point-3" cx="10" cy="30" r="8" fill="url(#g)"/>
    </g>
    <g id="nom" fill="#1D1D1B">
      <path id="T" d="M60 0h20v5h-20z"/>
      <path id="I" d="M90 0h5v40h-5z"/>
      <path id="M" d="M100 0h20v40h-20z"/>
    </g>
    <g id="Baseline"><path d="M60 50h60v5h-60z"/></g>
    <rect id="cadre" x="0" y="0" width="5" height="5"/>
  </g>
  <script>alert(1)</script>
</svg>`;

describe("le découpage du logo", () => {
  it("trouve symbole, nom et signature, quelle que soit la casse", () => {
    const p = parse(AFFINITY);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.logo.viewBox).toBe("0 0 300 100");
    expect(p.logo.symbol).toHaveLength(3);
    expect(p.logo.name).toHaveLength(3);
    expect(p.logo.baseline).toContain("M60 50h60v5h-60z");
    expect(logoSummary(p)).toBe("Animable : symbole en 3 élément(s), nom en 3 lettre(s), signature.");
  });

  it("chaque élément garde les transformations et couleurs des groupes qui le contiennent", () => {
    const p = parse(AFFINITY);
    if (!p.ok) throw new Error();
    expect(p.logo.symbol[0]).toMatch(/^<g transform="matrix\(1,0,0,1,10,0\)">[\s\S]*point-1[\s\S]*<\/g>$/);
    expect(p.logo.name[0]).toContain('fill="#1D1D1B"');
    expect(p.logo.defs).toContain("linearGradient");
  });

  it("le reste du dessin apparaît d'un bloc, sans les calques animés", () => {
    const p = parse(AFFINITY);
    if (!p.ok) throw new Error();
    expect(p.logo.rest).toContain('id="cadre"');
    expect(p.logo.rest).not.toContain("point-1");
    expect(p.logo.rest).not.toContain("linearGradient");
  });

  it("rien d'exécutable ni d'externe n'entre dans un rendu", () => {
    const p = parse(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><g id="nom" onclick="x()"><a href="https://evil"><path d="M0 0h1"/></a><path d="M1 1h1"/></g><image href="data:image/png;base64,AA"/></svg>`);
    if (!p.ok) throw new Error();
    const all = JSON.stringify(p.logo);
    expect(all).not.toMatch(/onclick|evil|<image|<script/);
    expect(p.notes.join(" ")).toMatch(/matricielle/);
  });

  it("un SVG sans calques nommés reste utilisable, en fondu", () => {
    const p = parse(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><path d="M0 0h40v20z"/></svg>`);
    expect(p).toMatchObject({ ok: true, logo: { viewBox: "0 0 40 20", symbol: [], name: [] } });
    if (p.ok) expect(logoSummary(p)).toMatch(/fondu/);
  });

  it("refuse ce qui n'est pas un SVG, ou un SVG sans dimensions", () => {
    expect(parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>`)).toMatchObject({ ok: false, error: expect.stringMatching(/viewBox/) });
  });

  it("noms de calques : casse, accents, espaces", () => {
    expect(normId("Symbole")).toBe("symbole");
    expect(normId("Icône")).toBe("icone");
    expect(normId("Point 1")).toBe("point-1");
  });
});

describe("le logo et la police du kit dans le rendu", () => {
  it("un style « police du Kit » prend celle du kit ; le plan logo passe tel quel", async () => {
    const { buildRenderProps, renderStyleOf } = await import("@/modules/ads/video/props");
    expect(renderStyleOf({ titleFont: "kit", bodyFont: "inter", titleCase: "kit" }, { titleFont: "poppins", titleCase: "majuscules" })).toMatchObject({ titleFont: "Poppins", titleUpper: true });
    const p = buildRenderProps(
      { shots: [{ kind: "logo", seconds: 1.5 }, { kind: "fin", seconds: 2 }] },
      { format: "9x16", style: { logoAnimation: "fondu" }, kit: {}, cta: "En savoir plus", rushes: new Map(), facts: new Map(), logoAnimated: { viewBox: "0 0 1 1", defs: "", symbol: ["<circle/>"], name: [], baseline: null, rest: "" } },
    );
    expect(p.shots[0]).toEqual({ kind: "logo", frames: 45 });
    expect(p.style.logoAnimation).toBe("fondu");
    expect(p.logoAnimated?.symbol).toHaveLength(1);
  });

  it("au rendu : seul un SVG lisible devient animable ; sinon le logo est posé, sans erreur", async () => {
    const { loadAnimatedLogo } = await import("@/modules/ads/video/logo-server");
    const ok = vi.fn(async () => new Response(AFFINITY));
    expect((await loadAnimatedLogo({ url: "https://cdn/l.svg", mimeType: "image/svg+xml" }, ok as never))?.symbol).toHaveLength(3);
    expect(await loadAnimatedLogo({ url: "https://cdn/l.png", mimeType: "image/png" }, ok as never)).toBeNull();
    expect(await loadAnimatedLogo({ url: "https://cdn/l.svg", mimeType: "image/svg+xml" }, (async () => new Response("", { status: 404 })) as never)).toBeNull();
    expect(await loadAnimatedLogo(null)).toBeNull();
  });
});
