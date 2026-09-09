import { describe, expect, it } from "vitest";

process.env.PAYLOAD_SECRET ??= "secret-de-test-pour-les-jetons-davis";

import { normalizeTexts } from "@/modules/marketing/lib/email-overrides";
import { EMAIL_SLOTS, defaultSlotText, isKnownSlot } from "@/modules/marketing/lib/email-slots";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { JOURNEY_VARIABLES, applyJourneyVars, unknownJourneyVars } from "@/modules/marketing/lib/journey-vars";

/**
 * Reprendre à la main les textes du parcours.
 *
 * La garantie qui rend l'écran sans danger : VIDE = LE TEXTE DU CODE. Tant que
 * personne n'écrit, rien ne bouge ; effacer une reprise revient en arrière. Sans
 * elle, un champ vidé amputerait un message déjà parti chez des clients.
 */

const CTX = {
  clientName: "Dupont BTP",
  contactFirstName: "Marie",
  startDate: "2026-09-07T00:00:00.000Z",
  endDate: "2026-10-05T00:00:00.000Z",
  credentialCount: 9,
};

describe("variables des textes", () => {
  it("remplace ce qu'elle connaît", () => {
    expect(applyJourneyVars("Bonjour {{prenom}} de {{entreprise}}", { prenom: "Marie", entreprise: "Dupont BTP" }))
      .toBe("Bonjour Marie de Dupont BTP");
  });

  it("met le repli quand la valeur manque : jamais un trou dans la phrase", () => {
    expect(applyJourneyVars("Chez {{entreprise}}", { entreprise: null })).toBe("Chez votre entreprise");
    expect(applyJourneyVars("Démarre {{date_debut}}", {})).toBe("Démarre prochainement");
  });

  it("laisse VISIBLE une variable inconnue, plutôt que de l'effacer", () => {
    // L'effacer ferait disparaître le symptôme sans corriger la cause.
    expect(applyJourneyVars("Bonjour {{prenoom}}", {})).toBe("Bonjour {{prenoom}}");
  });

  it("repère les variables inconnues — c'est ce que la validation refuse", () => {
    expect(unknownJourneyVars("Bonjour {{prenom}}")).toEqual([]);
    expect(unknownJourneyVars("Bonjour {{prenoom}} de {{societe}}")).toEqual(["prenoom", "societe"]);
  });

  it("chaque variable a un repli non vide, sauf le prénom", () => {
    for (const v of JOURNEY_VARIABLES) {
      if (v.token === "prenom") continue;
      expect(v.fallback.trim(), v.token).not.toBe("");
    }
  });
});

describe("blocs déclarés", () => {
  it("chaque message du parcours déclare ses blocs", () => {
    for (const key of Object.keys(EMAIL_SLOTS)) {
      expect(JOURNEY_EMAILS[key], key).toBeTypeOf("function");
      expect(EMAIL_SLOTS[key].length, key).toBeGreaterThan(0);
    }
  });

  it("aucun bloc en double dans un même message", () => {
    for (const [key, slots] of Object.entries(EMAIL_SLOTS)) {
      const noms = slots.map((s) => s.slot);
      expect(new Set(noms).size, key).toBe(noms.length);
    }
  });

  it("refuse un bloc qui n'existe pas sur ce message", () => {
    expect(isKnownSlot("check-in", "intro")).toBe(true);
    expect(isKnownSlot("check-in", "encadre")).toBe(false);
    expect(isKnownSlot("message-inconnu", "intro")).toBe(false);
  });
});

describe("un texte repris remplace bien le texte d'origine", () => {
  it("sans reprise, le message ne bouge pas", () => {
    const avant = JOURNEY_EMAILS["check-in"](CTX);
    const apres = JOURNEY_EMAILS["check-in"]({ ...CTX, texts: {} });
    expect(apres.html).toBe(avant.html);
    expect(apres.text).toBe(avant.text);
  });

  it("un bloc repris part dans les DEUX versions, HTML et texte", () => {
    const mail = JOURNEY_EMAILS["check-in"]({ ...CTX, texts: { intro: "Alors, ce chantier ?" } });
    expect(mail.html).toContain("Alors, ce chantier ?");
    expect(mail.text).toContain("Alors, ce chantier ?");
    expect(mail.text).not.toContain("Une semaine que votre test a démarré");
  });

  it("les variables d'un texte repris sont remplies", () => {
    const mail = JOURNEY_EMAILS["acces-prets"]({
      ...CTX,
      texts: { intro: "Les {{nb_acces}} comptes de {{entreprise}} sont prêts." },
    });
    expect(mail.text).toContain("Les 9 comptes de Dupont BTP sont prêts.");
  });

  /** Un champ ne contient jamais du HTML : le coller ne doit rien casser. */
  it("échappe ce qui est saisi, au lieu de l'interpréter", () => {
    const mail = JOURNEY_EMAILS["check-in"]({
      ...CTX,
      texts: { intro: "<script>alert(1)</script> & voilà" },
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&amp; voilà");
  });

  it("le titre et la ligne d'aperçu se reprennent aussi", () => {
    const mail = JOURNEY_EMAILS["dossier-recu"]({
      ...CTX,
      texts: { titre: "Bien reçu !", apercu: "On s'en occupe." },
    });
    expect(mail.html).toContain("Bien reçu !");
    expect(mail.html).toContain("On s'en occupe.");
    expect(mail.html).not.toContain("Dossier bien reçu");
  });

  it("le libellé d'un bouton se reprend, jamais son adresse", () => {
    const mail = JOURNEY_EMAILS["acces-prets"]({ ...CTX, texts: { bouton: "Récupérer mes accès" } });
    expect(mail.html).toContain("Récupérer mes accès");
    // L'adresse reste celle du code : un lien retapé est un lien mort.
    expect(mail.html).toContain("/espace-client/acces");
  });

  it("un bloc vide ou absent laisse le texte d'origine", () => {
    const mail = JOURNEY_EMAILS["dossier-recu"]({ ...CTX, texts: { intro: "   " } });
    expect(mail.text).toContain("Votre dossier de démarrage nous est bien parvenu");
  });
});

describe("lecture des reprises enregistrées", () => {
  const stock = [
    { key: "check-in", slot: "intro", value: "Alors ?" },
    { key: "check-in", slot: "dispo", value: "" },
    { key: "acces-prets", slot: "intro", value: "Vos comptes." },
  ];

  it("ne rend que les blocs DU message demandé", () => {
    expect(normalizeTexts(stock, "check-in")).toEqual({ intro: "Alors ?" });
    expect(normalizeTexts(stock, "acces-prets")).toEqual({ intro: "Vos comptes." });
  });

  it("ignore un message sans aucune reprise", () => {
    expect(normalizeTexts(stock, "decision")).toEqual({});
  });
});

/**
 * Les textes vivent désormais DANS la table, pas dans les gabarits : c'est ce
 * qui permet à l'écran de les préremplir, et donc de les modifier plutôt que
 * d'écrire dans le vide.
 */
describe("la table est la source des textes", () => {
  it("chaque bloc déclaré porte un texte", () => {
    for (const [key, slots] of Object.entries(EMAIL_SLOTS)) {
      for (const slot of slots) {
        expect(slot.defaut.trim(), `${key}/${slot.slot}`).not.toBe("");
        expect(defaultSlotText(key, slot.slot)).toBe(slot.defaut);
      }
    }
  });

  it("aucun texte livré ne contient de variable inconnue", () => {
    for (const [key, slots] of Object.entries(EMAIL_SLOTS)) {
      for (const slot of slots) {
        expect(unknownJourneyVars(slot.defaut), `${key}/${slot.slot}`).toEqual([]);
      }
    }
  });

  /**
   * Le repli d'une variable doit produire une PHRASE, pas un trou. Un message
   * envoyé hors parcours n'a ni démarrage ni échéance : c'est le cas réel de
   * l'invitation à l'espace client d'un prospect.
   */
  it("chaque texte tient debout sans aucune donnée", () => {
    for (const [key, slots] of Object.entries(EMAIL_SLOTS)) {
      for (const slot of slots) {
        const rendu = applyJourneyVars(slot.defaut, {});
        expect(rendu, `${key}/${slot.slot}`).not.toMatch(/\{\{|undefined|\bnull\b/);
        // « démarre le prochainement » : une date collée derrière son article.
        expect(rendu, `${key}/${slot.slot}`).not.toMatch(
          /\b(le|du|au) (prochainement|bientôt)\b/i,
        );
      }
    }
  });

  it("le gras se rend en HTML et disparaît en texte", () => {
    const mail = JOURNEY_EMAILS["check-in"]({ ...CTX, texts: { intro: "Du **gras** ici." } });
    expect(mail.html).toContain("<strong>gras</strong>");
    expect(mail.text).toContain("Du gras ici.");
    expect(mail.text).not.toContain("**");
  });

  it("un retour à la ligne devient un saut de ligne en HTML", () => {
    const mail = JOURNEY_EMAILS["check-in"]({ ...CTX, texts: { intro: "Une ligne\nUne autre" } });
    expect(mail.html).toContain("Une ligne<br>Une autre");
    expect(mail.text).toContain("Une ligne\nUne autre");
  });
});

/**
 * LE test qui compte : chaque bloc proposé à l'écran change vraiment le message.
 *
 * Le défaut qu'il attrape n'a pas de symptôme. Un bloc déclaré dans la table
 * mais que le gabarit ne lit pas s'affiche comme les autres, s'enregistre comme
 * les autres — et ne change rien. On croit avoir réécrit un texte qui continue
 * de partir tel qu'il était, et on ne s'en aperçoit qu'en relisant un message
 * reçu. Trois blocs étaient dans ce cas (09/09/2026).
 */
describe("aucun bloc éditable dans le vide", () => {
  /** Ce qui n'a pas d'équivalent dans un message en texte brut. */
  const HTML_SEULEMENT = new Set(["titre", "apercu", "bouton"]);

  const CTX_COMPLET = {
    runId: 42,
    clientName: "Dupont BTP",
    contactFirstName: "Marie",
    partnerName: "Charlie",
    startDate: "2026-09-07T00:00:00.000Z",
    endDate: "2026-10-05T00:00:00.000Z",
    sessionAt: "2026-09-04T08:00:00.000Z",
    sessionModality: "en visio",
    credentialCount: 9,
    code: "123456",
  };

  for (const [key, slots] of Object.entries(EMAIL_SLOTS)) {
    for (const slot of slots) {
      it(`${key} / ${slot.slot} change les DEUX versions du message`, () => {
        // Un mot qu'aucun gabarit ne contient : s'il n'apparaît pas, c'est que
        // le bloc n'est lu nulle part.
        const temoin = "ZZTEMOINZZ";
        const mail = JOURNEY_EMAILS[key]({ ...CTX_COMPLET, texts: { [slot.slot]: temoin } });

        expect(mail.subject + mail.html, `${key}/${slot.slot} absent du HTML`).toContain(temoin);

        /**
         * Et dans la version TEXTE aussi.
         *
         * Un bloc lu d'un seul côté fait dire deux choses différentes au même
         * message selon la messagerie qui l'ouvre — et c'est la version qu'on ne
         * relit jamais qui garde l'ancien texte. « Rappel de créneau » était dans
         * ce cas (09/09/2026).
         *
         * Trois blocs n'existent que dans la version HTML, et c'est normal : un
         * message en texte brut n'a ni titre, ni ligne d'aperçu, ni bouton.
         */
        if (!HTML_SEULEMENT.has(slot.slot)) {
          expect(mail.subject + mail.text, `${key}/${slot.slot} absent du texte`).toContain(temoin);
        }
      });
    }
  }
});

/**
 * Ce qu'aucun message ne doit jamais faire, quel que soit ce qu'on a écrit.
 *
 * Ces messages partent chez des clients : une balise passée à travers, un objet
 * sur deux lignes ou un « undefined » au milieu d'une phrase ne se rattrapent
 * pas après l'envoi.
 */
describe("garanties sur tous les messages", () => {
  /** Un nom d'entreprise qui contient exactement ce qui casse du HTML. */
  const CTX = {
    runId: 1,
    clientName: "Dupont & Fils <BTP>",
    contactFirstName: "Marie",
    credentialCount: 9,
    startDate: "2026-09-07T00:00:00.000Z",
    endDate: "2026-10-05T00:00:00.000Z",
    sessionAt: "2026-09-04T08:00:00.000Z",
    sessionModality: "en visio",
    code: "123456",
  };

  for (const key of Object.keys(EMAIL_SLOTS)) {
    describe(key, () => {
      const mail = JOURNEY_EMAILS[key](CTX);

      it("ne laisse aucun trou : ni variable, ni « undefined »", () => {
        for (const part of [mail.subject, mail.html, mail.text]) {
          expect(part).not.toMatch(/undefined|\bnull\b|\{\{/);
        }
      });

      it("n'écrit jamais le nom de l'entreprise brut dans le HTML", () => {
        expect(mail.html).not.toContain("<BTP>");
      });

      it("ne laisse ni balise ni marque de gras dans la version texte", () => {
        expect(mail.text).not.toMatch(/<\/?(strong|br|span|a)\b/);
        expect(mail.text).not.toContain("**");
      });

      it("porte un objet, sur une seule ligne", () => {
        // Un objet multiligne coupe l'en-tête du message chez certains serveurs.
        expect(mail.subject.trim()).not.toBe("");
        expect(mail.subject).not.toMatch(/[\r\n]/);
      });

      it("produit un document HTML complet", () => {
        expect(mail.html.startsWith("<!doctype html>")).toBe(true);
      });
    });
  }

  /**
   * Un champ de texte n'est jamais du HTML. Ce qu'on y colle s'affiche, ne
   * s'exécute pas — sinon un modèle réécrit deviendrait une porte d'entrée dans
   * la boîte de tous les clients.
   */
  it("échappe le nom de l'entreprise là où il apparaît", () => {
    const mail = JOURNEY_EMAILS["acces-prets"](CTX);
    expect(mail.html).toContain("Dupont &amp; Fils &lt;BTP&gt;");
    // La version texte, elle, n'a rien à échapper : elle n'est pas du HTML.
    expect(mail.text).toContain("Dupont & Fils <BTP>");
  });

  it("aucun bloc ne laisse passer de balise, sur aucun message", () => {
    const charge = `<img src=x onerror="alert(1)">`;
    for (const [key, slots] of Object.entries(EMAIL_SLOTS)) {
      for (const slot of slots) {
        const mail = JOURNEY_EMAILS[key]({ ...CTX, texts: { [slot.slot]: charge } });
        expect(mail.html, `${key}/${slot.slot}`).not.toContain("<img src=x");
        // L'objet n'entre pas dans le HTML : c'est un en-tête, pas une page.
        if (slot.slot !== "objet") {
          expect(mail.html, `${key}/${slot.slot}`).toContain("&lt;img src=x");
        }
      }
    }
  });

  /**
   * Un retour à la ligne dans un objet coupe l'en-tête du message : tout ce qui
   * suit est réinterprété par le serveur d'envoi. C'est la seule injection que
   * l'objet rende possible, et elle se joue sur un simple « Entrée ».
   */
  it("aplatit un objet écrit sur plusieurs lignes", () => {
    for (const key of Object.keys(EMAIL_SLOTS)) {
      const mail = JOURNEY_EMAILS[key]({
        ...CTX,
        texts: { objet: "Première ligne\nBcc: quelquun@ailleurs.fr" },
      });
      expect(mail.subject, key).not.toMatch(/[\r\n]/);
    }
  });
});

/**
 * Les OBJETS, et ce que trois d'entre eux calculent.
 *
 * Un objet figé coûte cher : « Votre code de connexion » au lieu de
 * « 123456 — votre code de connexion TIM », c'est un client qui doit ouvrir le
 * message pour lire un code qu'il aurait lu depuis sa notification. Le premier
 * essai de rendre les objets modifiables les avait justement figés, sur quatre
 * messages, sans que rien ne le signale (09/09/2026).
 */
describe("objets des messages", () => {
  const CTX = {
    runId: 1,
    clientName: "Dupont BTP",
    contactFirstName: "Marie",
    credentialCount: 9,
    startDate: "2026-09-07T00:00:00.000Z",
    endDate: "2026-10-05T00:00:00.000Z",
    sessionAt: "2026-09-04T08:00:00.000Z",
    sessionModality: "en visio",
    code: "123456",
  };

  it("le code de connexion se lit DANS l'objet, sans ouvrir le message", () => {
    expect(JOURNEY_EMAILS["code-connexion"](CTX).subject).toContain("123456");
  });

  it("le créneau réservé nomme le client : le partenaire en reçoit plusieurs", () => {
    expect(JOURNEY_EMAILS["creneau-reserve"](CTX).subject).toContain("Dupont BTP");
  });

  it("le dernier jour porte sa date", () => {
    expect(JOURNEY_EMAILS["dernier-jour"](CTX).subject).toMatch(/octobre/);
  });

  it("chaque message expose son objet, et il se réécrit", () => {
    for (const key of Object.keys(EMAIL_SLOTS)) {
      expect(isKnownSlot(key, "objet"), key).toBe(true);
      const mail = JOURNEY_EMAILS[key]({ ...CTX, texts: { objet: "Un autre objet" } });
      expect(mail.subject, key).toBe("Un autre objet");
    }
  });

  it("un objet réécrit garde ses variables et tient sur une ligne", () => {
    const mail = JOURNEY_EMAILS["acces-prets"]({
      ...CTX,
      texts: { objet: "Les {{nb_acces}} accès de\n{{entreprise}}" },
    });
    // Un objet sur deux lignes coupe l'en-tête chez certains serveurs.
    expect(mail.subject).toBe("Les 9 accès de {{entreprise}}".replace("{{entreprise}}", "Dupont BTP"));
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it("un objet n'est pas du HTML : il ne s'échappe pas", () => {
    // « &amp; » s'afficherait tel quel dans une boîte de réception.
    const mail = JOURNEY_EMAILS["dossier-recu"]({ ...CTX, texts: { objet: "Vous & nous" } });
    expect(mail.subject).toBe("Vous & nous");
  });
});
