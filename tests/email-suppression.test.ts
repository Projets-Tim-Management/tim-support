import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readUnsubscribeToken,
  unsubscribeHeaders,
  unsubscribeToken,
  unsubscribeUrl,
} from "@/core/lib/email-suppression";

/**
 * Le lien de désinscription est la seule chose qui empêche une plainte pour
 * spam. Un jeton qui ne se relit pas, et la personne clique sur « Spam » — ce
 * qui abîme la réputation d'expéditeur de TOUS les envois, e-mails de tickets
 * compris.
 */

const SECRET = "secret-de-test-pour-la-signature";

describe("jeton de désinscription", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("se relit et rend l'adresse d'origine", () => {
    vi.stubEnv("PAYLOAD_SECRET", SECRET);
    const t = unsubscribeToken("Contact@Capblancq.FR");
    // Normalisée : la casse ne doit pas créer deux identités.
    expect(readUnsubscribeToken(t)).toBe("contact@capblancq.fr");
  });

  it("produit le même jeton pour la même adresse", () => {
    vi.stubEnv("PAYLOAD_SECRET", SECRET);
    // Déterministe : un même destinataire peut se désinscrire depuis n'importe
    // lequel des messages qu'il a reçus.
    expect(unsubscribeToken("a@b.fr")).toBe(unsubscribeToken("A@B.fr"));
  });

  it("refuse une signature fausse, absente ou tronquée", () => {
    vi.stubEnv("PAYLOAD_SECRET", SECRET);
    const t = unsubscribeToken("a@b.fr");
    const [encoded, signature] = t.split(".");
    expect(readUnsubscribeToken(`${encoded}.${signature.slice(0, -1)}x`)).toBeNull();
    expect(readUnsubscribeToken(encoded)).toBeNull();
    expect(readUnsubscribeToken(`${encoded}.`)).toBeNull();
    expect(readUnsubscribeToken("")).toBeNull();
    expect(readUnsubscribeToken(null)).toBeNull();
  });

  it("refuse un jeton signé avec un autre secret", () => {
    vi.stubEnv("PAYLOAD_SECRET", SECRET);
    const t = unsubscribeToken("a@b.fr");
    vi.stubEnv("PAYLOAD_SECRET", "un-autre-secret-de-la-meme-taille");
    expect(readUnsubscribeToken(t)).toBeNull();
  });

  it("refuse une adresse forgée sans signature valable", () => {
    // Sans signature, on désinscrirait n'importe qui en devinant une adresse.
    vi.stubEnv("PAYLOAD_SECRET", SECRET);
    const forge = Buffer.from("victime@example.fr").toString("base64url");
    expect(readUnsubscribeToken(`${forge}.nimportequoi`)).toBeNull();
  });

  it("refuse un contenu qui n'est pas une adresse", () => {
    vi.stubEnv("PAYLOAD_SECRET", SECRET);
    const encoded = Buffer.from("pas-une-adresse").toString("base64url");
    expect(readUnsubscribeToken(`${encoded}.peu-importe`)).toBeNull();
  });

  it("ne lève pas quand le secret manque, il refuse", () => {
    // Une exception ici rendrait la page de désinscription indisponible.
    vi.stubEnv("PAYLOAD_SECRET", "");
    expect(() => readUnsubscribeToken("a.b")).not.toThrow();
    expect(readUnsubscribeToken("a.b")).toBeNull();
  });
});

describe("lien et en-têtes", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("construit un lien exploitable depuis n'importe quel message", () => {
    vi.stubEnv("PAYLOAD_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://support.tim-management.co/");
    const url = unsubscribeUrl("a@b.fr");
    expect(url.startsWith("https://support.tim-management.co/api/desinscription?t=")).toBe(true);
    // Pas de double barre oblique quand la variable se termine par un slash.
    expect(url).not.toContain(".co//");
    expect(readUnsubscribeToken(new URL(url).searchParams.get("t"))).toBe("a@b.fr");
  });

  it("porte les deux en-têtes qui activent le bouton natif du client de messagerie", () => {
    vi.stubEnv("PAYLOAD_SECRET", SECRET);
    const h = unsubscribeHeaders("a@b.fr");
    expect(h["List-Unsubscribe"]).toMatch(/^<https:\/\/.+\/api\/desinscription\?t=.+>$/);
    // Sans cet en-tête, Gmail n'affiche pas « Se désabonner » et le lecteur
    // pressé clique sur « Spam » à la place.
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
