import { describe, expect, it } from "vitest";

import { SEED_SEQUENCES } from "@/modules/marketing/lib/sequence-contents";
import {
  addDelay,
  addMonths,
  orderedMessages,
  planMessages,
  sequenceForLossReason,
  type SequenceDoc,
  type SequenceMessage,
} from "@/modules/marketing/lib/sequences";

/**
 * Ce module décide QUI reçoit QUOI et QUAND, sur plus d'un an. Une erreur ne se
 * voit pas le jour où on la commet : elle se voit des mois plus tard, dans la
 * boîte d'un prospect.
 */

const seq = (over: Partial<SequenceDoc> = {}): SequenceDoc => ({
  key: "marketing",
  label: "Marketing",
  active: true,
  lossReasons: ["prix", "concurrent"],
  messages: [{ key: "a", delayValue: 2, delayUnit: "mois" }],
  ...over,
});

describe("choix de la séquence", () => {
  it("retient celle qui revendique le motif", () => {
    const sans = seq({ key: "sans-retour", lossReasons: ["sans-reponse"] });
    const all = [seq(), sans];
    expect(sequenceForLossReason(all, "prix")?.key).toBe("marketing");
    expect(sequenceForLossReason(all, "sans-reponse")?.key).toBe("sans-retour");
  });

  it("n'ouvre rien sans motif, ni pour un motif que personne ne revendique", () => {
    const all = [seq()];
    expect(sequenceForLossReason(all, null)).toBeNull();
    expect(sequenceForLossReason(all, "")).toBeNull();
    expect(sequenceForLossReason(all, "cessation")).toBeNull();
    expect(sequenceForLossReason([], "prix")).toBeNull();
  });

  it("ignore une séquence désactivée", () => {
    // Décocher « Active » doit suffire à couper les enrôlements, sans avoir à
    // vider la liste des motifs.
    expect(sequenceForLossReason([seq({ active: false })], "prix")).toBeNull();
  });

  it("ignore une séquence sans aucun message", () => {
    // Enrôler dans une séquence vide créerait une ligne qui n'enverra jamais rien.
    expect(sequenceForLossReason([seq({ messages: [] })], "prix")).toBeNull();
  });
});

describe("ordre des messages", () => {
  const messages: SequenceMessage[] = [
    { key: "planning", besoin: "planning" },
    { key: "pointage", besoin: "pointage" },
    { key: "heures", besoin: "pointage" },
    { key: "chantier", besoin: "chantiers" },
    { key: "bilan" },
  ];

  it("garde l'ordre du modèle quand rien n'a été coché", () => {
    expect(orderedMessages(messages, []).map((m) => m.key)).toEqual([
      "planning",
      "pointage",
      "heures",
      "chantier",
      "bilan",
    ]);
  });

  it("fait passer devant ce que la personne a demandé, dans SON ordre", () => {
    expect(orderedMessages(messages, ["chantiers", "planning"]).map((m) => m.key)).toEqual([
      "chantier",
      "planning",
      "pointage",
      "heures",
      "bilan",
    ]);
  });

  it("remonte les deux messages d'un même besoin", () => {
    expect(orderedMessages(messages, ["pointage"]).slice(0, 2).map((m) => m.key)).toEqual([
      "pointage",
      "heures",
    ]);
  });

  it("ne remonte jamais un message sans besoin déclaré", () => {
    // Un bilan de clôture n'ouvre pas une séquence.
    for (const besoins of [[], ["planning"], ["pointage", "chantiers"]]) {
      const keys = orderedMessages(messages, besoins).map((m) => m.key);
      expect(keys[keys.length - 1], besoins.join()).toBe("bilan");
    }
  });

  it("n'oublie ni ne duplique aucun message, et écarte ceux sans clé", () => {
    for (const besoins of [[], ["inconnu"], ["pointage", "pointage"], ["chantiers", "planning"]]) {
      const keys = orderedMessages(messages, besoins).map((m) => m.key);
      expect(keys.length, besoins.join()).toBe(messages.length);
      expect(new Set(keys).size, besoins.join()).toBe(messages.length);
    }
    expect(orderedMessages([{ key: "" }, { key: "ok" }]).map((m) => m.key)).toEqual(["ok"]);
  });
});

describe("calcul des délais", () => {
  it("reste dans le mois visé quand le jour n'existe pas", () => {
    // setMonth ferait déborder le 31 janvier sur le 3 mars, et chaque étape
    // glisserait d'un mois de plus.
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date("2026-08-31T10:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  it("applique les trois unités", () => {
    const from = new Date("2026-09-04T10:00:00Z");
    expect(addDelay(from, 10, "jours").toISOString().slice(0, 10)).toBe("2026-09-14");
    expect(addDelay(from, 3, "semaines").toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(addDelay(from, 2, "mois").toISOString().slice(0, 10)).toBe("2026-11-04");
  });

  it("traite un délai absent ou aberrant comme zéro, sans reculer dans le temps", () => {
    const from = new Date("2026-09-04T10:00:00Z");
    expect(addDelay(from, -5, "jours").getTime()).toBe(from.getTime());
    expect(addDelay(from, NaN, "mois").getTime()).toBe(from.getTime());
  });
});

describe("calendrier posé à l'enrôlement", () => {
  const from = new Date("2026-09-04T10:00:00Z");

  it("cumule les délais depuis le message précédent", () => {
    // C'est ce qui permet un rythme irrégulier : trois semaines, puis un mois,
    // puis deux — sans avoir à calculer des dates absolues.
    const plan = planMessages(
      [
        { key: "a", delayValue: 3, delayUnit: "semaines" },
        { key: "b", delayValue: 1, delayUnit: "mois" },
        { key: "c", delayValue: 2, delayUnit: "mois" },
      ],
      [],
      from,
    );
    expect(plan.map((m) => m.scheduledAt.slice(0, 10))).toEqual([
      "2026-09-25",
      "2026-10-25",
      "2026-12-25",
    ]);
  });

  it("n'envoie rien le jour même de la perte", () => {
    // Écrire à quelqu'un le jour où on le déclare perdu transforme un
    // « pas maintenant » en « plus jamais ».
    const plan = planMessages([{ key: "a", delayValue: 2, delayUnit: "mois" }], [], from);
    expect(new Date(plan[0].scheduledAt).getTime()).toBeGreaterThan(from.getTime());
  });

  it("respecte l'ordre choisi par les besoins", () => {
    const plan = planMessages(
      [
        { key: "planning", delayValue: 2, delayUnit: "mois", besoin: "planning" },
        { key: "chantier", delayValue: 2, delayUnit: "mois", besoin: "chantiers" },
      ],
      ["chantiers"],
      from,
    );
    expect(plan[0].key).toBe("chantier");
    expect(plan[0].scheduledAt.slice(0, 10)).toBe("2026-11-04");
  });

  it("ne produit rien pour une séquence sans message", () => {
    expect(planMessages([], [], from)).toEqual([]);
  });
});

describe("séquences livrées avec le code", () => {
  it("n'attribue jamais le même motif à deux séquences", () => {
    // Deux séquences qui revendiquent le même motif rendraient le choix
    // arbitraire : la première trouvée gagnerait.
    const seen = new Set<string>();
    for (const s of SEED_SEQUENCES) {
      for (const r of s.lossReasons) {
        expect(seen.has(r), `motif « ${r} » revendiqué deux fois`).toBe(false);
        seen.add(r);
      }
    }
  });

  it("ne laisse aucune clé de message en double dans une séquence", () => {
    for (const s of SEED_SEQUENCES) {
      const keys = s.messages.map((m) => m.key);
      expect(new Set(keys).size, s.key).toBe(keys.length);
    }
  });

  it("donne à chaque message un délai et un texte", () => {
    for (const s of SEED_SEQUENCES) {
      for (const m of s.messages) {
        expect(m.delayValue, `${s.key}/${m.key}`).toBeGreaterThan(0);
        expect(m.paragraphs.length, `${s.key}/${m.key}`).toBeGreaterThan(0);
      }
    }
  });

  it("donne un bouton aux messages marketing, et à eux seuls", () => {
    /**
     * Un message marketing sans bouton ne mène nulle part ; une relance sobre
     * AVEC bouton se lit comme une campagne, ce qui est tout ce qu'on cherche à
     * éviter en la choisissant sobre — un lien seul sur sa ligne suffit à
     * trahir l'envoi automatique.
     */
    for (const s of SEED_SEQUENCES) {
      for (const m of s.messages) {
        if (m.style === "marketing") {
          expect(m.cta?.trim(), `${s.key}/${m.key}`).toBeTruthy();
          expect(m.url?.startsWith("https://"), `${s.key}/${m.key}`).toBe(true);
        } else {
          expect(m.cta, `${s.key}/${m.key}`).toBeUndefined();
          expect(m.url, `${s.key}/${m.key}`).toBeUndefined();
        }
      }
    }
  });

  it("habille chaque séquence dans le registre qui lui convient", () => {
    // Une relance personnelle dans un habillage de campagne se lit comme une
    // campagne de plus, et rate son seul objectif : obtenir une réponse.
    const styles = (k: string) =>
      SEED_SEQUENCES.find((s) => s.key === k)!.messages.map((m) => m.style);
    expect(new Set(styles("marketing"))).toEqual(new Set(["marketing"]));
    expect(new Set(styles("sans-retour"))).toEqual(new Set(["standard"]));
  });

  it("fait partir la relance personnelle d'une adresse de personne", () => {
    const sans = SEED_SEQUENCES.find((s) => s.key === "sans-retour")!;
    const mkt = SEED_SEQUENCES.find((s) => s.key === "marketing")!;
    expect(sans.fromEmail).not.toBe(mkt.fromEmail);
  });

  it("ne recopie aucune carte de visite : elle vient de la fiche partenaire", () => {
    // Une signature saisie ici serait une deuxième source pour la même
    // information : le jour où un numéro change, une des deux resterait fausse.
    for (const s of SEED_SEQUENCES) {
      expect(Object.keys(s).filter((k) => /^signature./.test(k)), s.key).toEqual([]);
    }
  });

  it("n'arrête sur réponse que la relance qui en attend une", () => {
    /**
     * Une campagne qui se coupe au premier « merci, pas pour l'instant » prive
     * le prospect de tout ce qui suit sans qu'il l'ait demandé — alors que ces
     * messages sont justement faits pour le retrouver un an plus tard.
     */
    const by = (k: string) => SEED_SEQUENCES.find((s) => s.key === k)!;
    expect(by("sans-retour").stopOnReply).toBe(true);
    expect(by("marketing").stopOnReply).toBe(false);
  });

  it("bascule « Sans retour » en campagne à la fin, et n'enchaîne pas en boucle", () => {
    const by = (k: string) => SEED_SEQUENCES.find((s) => s.key === k)!;
    expect(by("sans-retour").nextSequenceKey).toBe("marketing");
    // Une campagne qui enchaînerait sur elle-même, ou sur la relance qui vient
    // de s'achever, ne s'arrêterait jamais.
    expect(by("marketing").nextSequenceKey).toBeUndefined();
    for (const s of SEED_SEQUENCES) {
      expect(s.nextSequenceKey, s.key).not.toBe(s.key);
      if (s.nextSequenceKey) {
        expect(SEED_SEQUENCES.some((t) => t.key === s.nextSequenceKey), s.key).toBe(true);
      }
    }
  });

  it("laisse « Sans retour » inactive tant que son contenu n'est pas validé", () => {
    // Active, elle enrôlerait dès la première affaire close pour absence de
    // réponse et partirait avec des textes que personne n'a relus.
    expect(SEED_SEQUENCES.find((s) => s.key === "sans-retour")?.active).toBe(false);
  });
});
