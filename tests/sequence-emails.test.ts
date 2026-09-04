import { describe, expect, it } from "vitest";

import { buildSequenceEmail, type ThemeDoc } from "@/modules/marketing/lib/sequence-emails";
import { renderSignature } from "@/modules/partner/lib/signature";

/**
 * Assemblage d'un message de séquence.
 *
 * Ces messages partent tout seuls, des mois après la perte de l'affaire, sans
 * que personne ne les relise. Ce qui est vérifié ici est donc exactement ce qui
 * arrivera chez le prospect.
 */

const theme = (over: Partial<ThemeDoc> = {}): ThemeDoc => ({
  key: "relance",
  style: "standard",
  title: "Toujours d'actualité ?",
  subject: "Votre projet est-il toujours d'actualité ?",
  paragraphs: [{ text: "On s'était parlé, puis plus rien." }],
  payoff: "Un mot suffit.",
  cta: "Reprendre",
  url: "https://tim-management.co/contact",
  ...over,
});

const ctx = {
  firstName: "Luis",
  email: "luis@toiture34.fr",
  unsubscribeUrl: "https://support.tim-management.co/desinscription?t=abc",
};

describe("ce qu'on refuse d'envoyer", () => {
  it("ne fabrique rien à partir d'un thème absent ou désactivé", () => {
    expect(buildSequenceEmail(null, ctx)).toBeNull();
    expect(buildSequenceEmail(theme({ active: false }), ctx)).toBeNull();
  });

  it("ne fabrique rien sans texte ni objet", () => {
    for (const missing of [{ paragraphs: [] }, { subject: "", title: "" }]) {
      expect(buildSequenceEmail(theme(missing), ctx), JSON.stringify(missing)).toBeNull();
    }
  });

  it("refuse un message marketing sans bouton, mais pas une relance sobre", () => {
    // Un marketing amputé de son bouton part quand même et ne mène nulle part.
    // Une relance sobre, elle, n'en a jamais eu.
    for (const missing of [{ cta: "" }, { url: "" }]) {
      expect(buildSequenceEmail(theme({ ...missing, style: "marketing" }), ctx)).toBeNull();
      expect(buildSequenceEmail(theme(missing), ctx)).not.toBeNull();
    }
  });
});

describe("signature du partenaire", () => {
  const signed = {
    ...ctx,
    closing: "Bien cordialement,",
    signatureHtml: renderSignature({ name: "Charlie Piancatelli", phone: "06 50 46 75 48" }),
    signatureText: "Charlie Piancatelli\n06 50 46 75 48",
  };

  it("colle la signature du partenaire au bas d'un message sobre", () => {
    const mail = buildSequenceEmail(theme(), signed)!;
    expect(mail.html).toContain("Charlie Piancatelli");
    expect(mail.html).toContain("Bien cordialement,");
    // La version texte porte la même signature, coordonnées comprises.
    expect(mail.text).toContain("Charlie Piancatelli\n06 50 46 75 48");
  });

  it("signe quand même quand la fiche partenaire n'a aucun nom", () => {
    /**
     * Sans ce repli, le message se terminait sur « Bien cordialement, » suivi de
     * rien — ce qui se lit comme un envoi raté, exactement dans le message dont
     * tout l'intérêt est de passer pour écrit à la main.
     */
    const mail = buildSequenceEmail(theme(), { ...ctx, closing: "Bien cordialement," })!;
    expect(mail.html).toContain("L'équipe Tim Management");
    expect(mail.text).toContain("L'équipe Tim Management");
  });

  it("garde la formule de politesse de la séquence", () => {
    const mail = buildSequenceEmail(theme(), { ...signed, closing: "Excellente journée," })!;
    expect(mail.html).toContain("Excellente journée,");
    expect(mail.html).not.toContain("Bien cordialement,");
  });
});

describe("les deux registres", () => {
  it("sobre : rien à cliquer, rien à habiller", () => {
    /**
     * Ni bouton, ni lien seul sur sa ligne : même sans habillage, une ligne
     * « Reprendre là où on s'était arrêté » se lit comme un bouton et trahit
     * l'envoi automatique. L'action attendue est la réponse.
     */
    const html = buildSequenceEmail(theme({ cta: "Reprendre", url: "https://x.fr" }), ctx)!.html;
    expect(html).not.toContain("https://x.fr");
    expect(html).not.toContain("Reprendre");
    expect(html).not.toContain("border-radius:9px");
    expect(html).not.toContain("<h1");
  });

  it("sobre : ni adresse, ni pied de page, ni lien de désinscription visible", () => {
    /**
     * C'est la continuité d'une conversation, pas une campagne. Un encart
     * « Ne plus recevoir ces messages » sous la signature dit au lecteur qu'il
     * est sur une liste.
     *
     * Le moyen de s'opposer n'est pas supprimé pour autant : il passe par les
     * en-têtes List-Unsubscribe, que la messagerie affiche elle-même — voir
     * `unsubscribeHeaders`, posés à chaque envoi par sequence-send.
     */
    const mail = buildSequenceEmail(theme(), ctx)!;
    expect(mail.html).not.toContain(ctx.unsubscribeUrl);
    expect(mail.html).not.toContain("Ne plus recevoir");
    expect(mail.html).not.toContain("quai Jayr");
    expect(mail.html).not.toContain(ctx.email);
    expect(mail.text).not.toContain("désabonner");
  });

  it("marketing : un bouton, un titre, et l'image du hero", () => {
    const html = buildSequenceEmail(
      theme({ style: "marketing", image: { url: "https://cdn.tim.fr/planning.png" } }),
      ctx,
    )!.html;
    expect(html).toContain("border-radius:9px");
    expect(html).toContain("https://cdn.tim.fr/planning.png");
  });

  it("écarte une image dont l'URL est relative", () => {
    // Un client de messagerie n'a aucun domaine de référence : il afficherait un
    // cadre cassé. Mieux vaut le message sans visuel.
    const html = buildSequenceEmail(theme({ style: "marketing", image: { url: "/media/x.png" } }), ctx)!
      .html;
    expect(html).not.toContain("/media/x.png");
  });
});

describe("ce que le message porte toujours", () => {
  it("s'adresse à la personne quand on connaît son prénom, et tient sans", () => {
    expect(buildSequenceEmail(theme(), ctx)!.html).toContain("Bonjour Luis,");
    expect(buildSequenceEmail(theme(), { ...ctx, firstName: undefined })!.html).toContain("Bonjour,");
  });

  it("porte le lien de désinscription dans les deux versions du style marketing", () => {
    // Une campagne l'affiche : c'est ce que le lecteur y cherche. Le style
    // sobre s'en remet aux en-têtes, testés du côté de l'envoi.
    const mail = buildSequenceEmail(theme({ style: "marketing" }), ctx)!;
    expect(mail.html).toContain(ctx.unsubscribeUrl);
    expect(mail.text).toContain(ctx.unsubscribeUrl);
  });

  it("échappe ce qui vient de la base — texte, titre et pré-en-tête", () => {
    /**
     * Rien d'hostile ne s'écrit en back-office, mais une esperluette dans
     * « Heures & absences » suffit à produire du HTML invalide, et un guillemet
     * dans un attribut casse la mise en page chez la moitié des messageries.
     */
    const sale = 'Marge <b>"réelle"</b> & coûts';
    for (const style of ["standard", "marketing"]) {
      const mail = buildSequenceEmail(theme({ style, title: sale, paragraphs: [{ text: sale }] }), ctx)!;
      expect(mail.html, style).toContain("&lt;b&gt;");
      expect(mail.html, style).not.toContain("<b>");
      expect(mail.html, style).not.toContain('"réelle"');
    }
  });

  it("échappe aussi l'URL de l'image du hero", () => {
    const html = buildSequenceEmail(
      theme({ style: "marketing", image: { url: 'https://cdn.tim.fr/a.png?x=1"onerror="x' } }),
      ctx,
    )!.html;
    expect(html).not.toContain('"onerror="');
  });
});
