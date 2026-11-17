import { describe, expect, it } from "vitest";

import { replyDraft } from "@/modules/partner/lib/reply-draft";

describe("répondre à un e-mail du prospect", () => {
  it("à son adresse, « Re : » l'objet de son message, son message cité, dans le même fil", () => {
    const d = replyDraft(
      { type: "tache", title: "Répondre à x@y.fr — a répondu à « Sans retour »", content: "Merci,\nil a choisi un autre logiciel.", occurredAt: "2026-10-23T09:19:00Z", emailFrom: "nathalie@ex.fr", emailSubject: "RE: On garde votre dossier ?", sourceMessageId: "<abc@mail>" },
      [],
    );
    expect(d.to).toBe("nathalie@ex.fr");
    expect(d.title).toBe("RE: On garde votre dossier ?");
    expect(d.inReplyTo).toBe("<abc@mail>");
    expect(d.quote).toEqual({ header: "Le 23 octobre 2026, nathalie@ex.fr a écrit :", text: "Merci,\nil a choisi un autre logiciel." });
  });

  it("une tâche d'avant (sans objet ni expéditeur) : l'adresse du titre et l'objet du dernier e-mail envoyé", () => {
    const d = replyDraft(
      { type: "tache", title: "Répondre à nathalie.zigoni@gmail.com — a répondu à « Sans retour »", content: "Bonjour" },
      [
        { type: "email", title: "Toujours d'actualité ?", occurredAt: "2026-11-14T08:00:00Z" },
        { type: "email", title: "Votre demande", occurredAt: "2026-10-01T08:00:00Z" },
        { type: "email", title: "Leur réponse", emailDirection: "recu", occurredAt: "2026-11-15T08:00:00Z" },
      ],
      "autre@ex.fr",
    );
    expect(d.to).toBe("nathalie.zigoni@gmail.com");
    expect(d.title).toBe("Re : Toujours d'actualité ?");
    expect(d.inReplyTo).toBeNull();
  });
});
