import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.fn();
vi.mock("@vercel/blob/client", () => ({ upload }));

import { uploadFile } from "@/core/lib/media-upload";

/**
 * Le trajet d'un fichier, du navigateur jusqu'au document `media`.
 *
 * Deux chemins, et le second existe pour que le premier puisse échouer sans
 * casser quoi que ce soit :
 *
 *  1. DIRECT AU CDN — le fichier ne traverse pas la fonction serverless, dont
 *     le corps de requête plafonne à 4,5 Mo. C'est ce qui permet les GIF de
 *     démonstration, qui pèsent couramment plus de dix méga-octets.
 *  2. PAR LE SERVEUR — repli quand la route de jeton n'existe pas (stockage
 *     local en développement). Comportement d'avant, conservé tel quel.
 *
 * Ce qui compte autant que le chemin : un échec doit RESSORTIR. L'ancienne
 * version faisait `if (!res.ok) return null`, et l'utilisateur ne voyait rien.
 */

/**
 * Un vrai `File` — pas un objet qui lui ressemble.
 *
 * `FormData.append` sérialise tout ce qui n'est pas un Blob : un faux fichier
 * rendrait le test vert sur un chemin que le navigateur ne prendrait jamais.
 * La taille est redéfinie plutôt qu'allouée : on veut éprouver un GIF de douze
 * méga-octets, pas les écrire.
 */
const fichier = (nom = "demo.gif", octets = 12 * 1024 * 1024): File => {
  const f = new File(["x"], nom, { type: nom.endsWith(".png") ? "image/png" : "image/gif" });
  Object.defineProperty(f, "size", { value: octets });
  return f;
};

const reponse = (status: number, corps: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corps }) as Response;

let appels: { url: string; body: FormData }[];

beforeEach(() => {
  appels = [];
  upload.mockReset();
  vi.stubGlobal("fetch", async (url: string, init: { body: FormData }) => {
    appels.push({ url, body: init.body });
    return reponse(201, { doc: { id: 7, url: "https://cdn/demo.gif" } });
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.unstubAllGlobals());

/** Ce que le champ `file` de la requête portait : des octets, ou une description. */
const champFile = (i = 0) => appels[i]?.body.get("file");

describe("envoi direct au CDN", () => {
  it("dépose le fichier sur le CDN, puis crée le document sans les octets", async () => {
    upload.mockResolvedValue({ pathname: "demo.gif" });

    const r = await uploadFile(fichier());

    expect(r).toEqual({ ok: true, doc: { id: 7, url: "https://cdn/demo.gif" } });
    expect(upload).toHaveBeenCalledTimes(1);
    // Le fichier n'a PAS traversé la fonction : le champ porte une description.
    const decrit = JSON.parse(String(champFile()));
    expect(decrit).toMatchObject({
      collectionSlug: "media",
      filename: "demo.gif",
      mimeType: "image/gif",
      size: 12 * 1024 * 1024,
    });
    // Sa présence est ce qui dit au serveur « le fichier est déjà en place ».
    expect(decrit.clientUploadContext).toEqual({ prefix: "" });
  });

  it("dépose sous la MÊME clé que celle enregistrée en base", async () => {
    // C'est la seule chose qui compte : le serveur ira chercher le fichier à
    // l'adresse déduite du nom stocké. Si les deux divergent, l'image est en
    // ligne mais introuvable — en ligne et cassée, le pire des deux.
    upload.mockResolvedValue({ pathname: "x" });

    for (const nom of ["Capture écran FINALE (2).gif", "dossier/sous/visuel.png", "simple.gif"]) {
      upload.mockClear();
      appels.length = 0;
      await uploadFile(fichier(nom));
      expect(upload.mock.calls[0][0], nom).toBe(JSON.parse(String(champFile())).filename);
    }
  });

  it("écarte les chemins glissés dans le nom du fichier", async () => {
    // `sanitizeFilename` — la même fonction que le serveur — ne garde que le
    // nom de base. Un nom qui remonte l'arborescence n'écrit donc rien ailleurs.
    upload.mockResolvedValue({ pathname: "x" });
    await uploadFile(fichier("a/b/../../evil.gif"));
    expect(upload.mock.calls[0][0]).toBe("evil.gif");
  });

  it("passe par la route de jeton du plugin, réservée aux comptes connectés", async () => {
    upload.mockResolvedValue({ pathname: "demo.gif" });
    await uploadFile(fichier());
    expect(upload.mock.calls[0][2]).toMatchObject({
      access: "public",
      clientPayload: "media",
      handleUploadUrl: "/payload-api/vercel-blob-client-upload-route",
    });
  });
});

describe("repli par le serveur", () => {
  it("renvoie les octets quand le dépôt direct est indisponible", async () => {
    // Cas du développement local sans stockage distant : la route de jeton
    // n'existe pas. Le comportement d'avant doit rester intact.
    upload.mockRejectedValue(new Error("404"));

    const r = await uploadFile(fichier("petit.png", 40 * 1024));

    expect(r.ok).toBe(true);
    expect(champFile()).toBeInstanceOf(File);
    expect(appels[0].url).toBe("/payload-api/media");
  });

  it("ne retente PAS quand le fichier est déjà sur le CDN", async () => {
    // Le dépôt a réussi, seule la création du document a échoué : renvoyer les
    // octets déposerait le fichier une seconde fois.
    upload.mockResolvedValue({ pathname: "demo.gif" });
    vi.stubGlobal("fetch", async () => reponse(400, { errors: [{ message: "Champ manquant." }] }));

    expect(await uploadFile(fichier())).toEqual({ ok: false, message: "Champ manquant." });
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("un échec ressort toujours", () => {
  it("refuse un fichier trop lourd sans rien envoyer", async () => {
    const r = await uploadFile(fichier("enorme.gif", 200 * 1024 * 1024));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain("200 Mo");
    expect(upload).not.toHaveBeenCalled();
    expect(appels).toHaveLength(0);
  });

  it("rapporte le message du serveur plutôt qu'un silence", async () => {
    upload.mockResolvedValue({ pathname: "demo.gif" });
    vi.stubGlobal("fetch", async () => reponse(403, null));

    const r = await uploadFile(fichier());
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/session|reconnect/i);
  });

  it("signale une réponse acceptée mais vide, au lieu de faire comme si", async () => {
    upload.mockResolvedValue({ pathname: "demo.gif" });
    vi.stubGlobal("fetch", async () => reponse(201, {}));

    const r = await uploadFile(fichier());
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/média attendu/i);
  });
});
