import { describe, expect, it } from "vitest";

import { keepAttentionFlags, keepMessagesOnSave } from "@/modules/support/hooks/keep-messages";

/**
 * Le fil d'un ticket ne perd jamais de message à l'enregistrement.
 *
 * Cas réel (#59321, 11/09/2026) : réponse envoyée depuis la vue du ticket,
 * puis statut changé et fiche enregistrée depuis un formulaire qui gardait
 * l'ancien fil en mémoire — la réponse a disparu de l'historique.
 */
const m = (id: string, sentAt: string, author = "client") => ({ id, sentAt, author, body: id });

describe("keepMessagesOnSave", () => {
  it("remet un message que l'enregistrement aurait fait disparaître, à sa place", () => {
    const original = [m("a", "2026-09-11T06:32:00Z"), m("b", "2026-09-11T07:27:00Z"), m("c", "2026-09-11T08:40:00Z", "support")];
    const stale = [m("a", "2026-09-11T06:32:00Z"), m("b", "2026-09-11T07:27:00Z")];
    expect(keepMessagesOnSave(stale, original)?.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("laisse passer un nouveau message sans identifiant (réponse, e-mail entrant)", () => {
    const original = [m("a", "2026-09-11T06:32:00Z")];
    const incoming = [...original, { sentAt: "2026-09-11T09:00:00Z", author: "support", body: "nouveau" }];
    expect(keepMessagesOnSave(incoming, original)).toBe(incoming);
  });

  it("laisse passer une correction d'un message existant", () => {
    const original = [m("a", "2026-09-11T06:32:00Z")];
    const edited = [{ ...m("a", "2026-09-11T06:32:00Z"), body: "corrigé" }];
    expect(keepMessagesOnSave(edited, original)).toBe(edited);
  });

  it("intercale un message remis entre les autres, par date", () => {
    const original = [m("a", "2026-09-11T06:00:00Z"), m("b", "2026-09-11T07:00:00Z"), m("c", "2026-09-11T08:00:00Z")];
    const stale = [m("a", "2026-09-11T06:00:00Z"), m("c", "2026-09-11T08:00:00Z")];
    expect(keepMessagesOnSave(stale, original)?.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("ne touche à rien sans fil d'origine ni sans fil transmis", () => {
    expect(keepMessagesOnSave(undefined, [m("a", "2026-09-11T06:00:00Z")])).toBeUndefined();
    expect(keepMessagesOnSave([], [])).toEqual([]);
    const fresh = [m("a", "2026-09-11T06:00:00Z")];
    expect(keepMessagesOnSave(fresh, undefined)).toBe(fresh);
  });
});

/**
 * Les drapeaux « à traiter » ne se touchent pas depuis une fiche : elle les
 * renvoie tels qu'à son ouverture, dans un sens (rallumer ce qu'une réponse a
 * éteint) comme dans l'autre (éteindre ce qu'un e-mail entrant a allumé).
 */
describe("keepAttentionFlags", () => {
  it("une fiche ne rallume pas un drapeau éteint", () => {
    const out = keepAttentionFlags(
      { unreadClientReply: true, needsAttention: true, status: "in_progress" },
      { unreadClientReply: false, needsAttention: false },
      true,
    );
    expect(out).toEqual({ status: "in_progress" });
  });
  it("une fiche n'éteint pas non plus un drapeau allumé entre-temps", () => {
    const out = keepAttentionFlags(
      { unreadClientReply: false, needsAttention: false, priority: "high" },
      { unreadClientReply: true, needsAttention: true },
      true,
    );
    expect(out).toEqual({ priority: "high" });
  });
  it("le système (webhook, route de réponse, cron) écrit librement", () => {
    expect(keepAttentionFlags({ unreadClientReply: true }, { unreadClientReply: false }, false)).toEqual({
      unreadClientReply: true,
    });
    expect(keepAttentionFlags({ unreadClientReply: false }, { unreadClientReply: true }, false)).toEqual({
      unreadClientReply: false,
    });
  });
  it("à la création, rien à protéger", () => {
    expect(keepAttentionFlags({ needsAttention: true }, undefined, true)).toEqual({ needsAttention: true });
  });
});
