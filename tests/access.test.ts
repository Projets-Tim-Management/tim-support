import { describe, expect, it } from "vitest";

import {
  canReadCatalog,
  canSupport,
  hasAdminRole,
  hasBackofficeRole,
  hideUnlessAdmin,
  hideUnlessMetier,
  hideUnlessSupport,
  hideUnlessUtilisateur,
  isAdmin,
  isPartner,
  isPartnerMetier,
  isPartnerUtilisateur,
  isSuperAdmin,
  isSupport,
  metierOwnedAccess,
  metierScoped,
  ownPartnerRecord,
  partnerIdOf,
  utilisateurOwnedAccess,
  utilisateurReadonlyAccess,
  utilisateurScoped,
} from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import { guardSuperAdminOnChange, guardSuperAdminOnDelete } from "@/core/hooks/superAdmin";

// ── Utilisateurs mockés (le scoping ne dépend QUE de roles + partner) ─────────
const superAdmin = { id: 1, roles: ["super-admin"] };
const admin = { id: 2, roles: ["admin"] };
const metier = { id: 3, roles: ["partner-metier"], partner: 10 };
const util = { id: 4, roles: ["partner-utilisateur"], partner: 20 };
const support = { id: 5, roles: ["support"] };
const anon = null;

/* eslint-disable @typescript-eslint/no-explicit-any */
const ctx = (user: unknown): any => ({ req: { user } });

describe("prédicats de rôle", () => {
  it("hasAdminRole : admin + super-admin uniquement", () => {
    expect(hasAdminRole(superAdmin)).toBe(true);
    expect(hasAdminRole(admin)).toBe(true);
    expect(hasAdminRole(metier)).toBe(false);
    expect(hasAdminRole(support)).toBe(false);
    expect(hasAdminRole(anon)).toBe(false);
  });

  it("isSuperAdmin", () => {
    expect(isSuperAdmin(superAdmin)).toBe(true);
    expect(isSuperAdmin(admin)).toBe(false);
  });

  it("rôles partenaires / support", () => {
    expect(isPartnerMetier(metier)).toBe(true);
    expect(isPartnerUtilisateur(util)).toBe(true);
    expect(isPartner(metier)).toBe(true);
    expect(isPartner(util)).toBe(true);
    expect(isPartner(support)).toBe(false);
    expect(isSupport(support)).toBe(true);
  });

  it("hasBackofficeRole : tout rôle connu, jamais un anonyme", () => {
    for (const u of [superAdmin, admin, metier, util, support]) expect(hasBackofficeRole(u)).toBe(true);
    expect(hasBackofficeRole(anon)).toBe(false);
    expect(hasBackofficeRole({ id: 9, roles: ["inconnu"] })).toBe(false);
  });

  it("partnerIdOf : id brut ou relation peuplée", () => {
    expect(partnerIdOf(metier)).toBe(10);
    expect(partnerIdOf({ roles: [], partner: { id: 42 } })).toBe(42);
    expect(partnerIdOf(admin)).toBeNull();
    expect(partnerIdOf(anon)).toBeNull();
  });
});

describe("row-level : scoping partenaire", () => {
  it("ownPartnerRecord : admin=tout, partenaire=SA fiche, support=rien", () => {
    expect(ownPartnerRecord(ctx(admin))).toBe(true);
    expect(ownPartnerRecord(ctx(superAdmin))).toBe(true);
    expect(ownPartnerRecord(ctx(metier))).toEqual({ id: { equals: 10 } });
    expect(ownPartnerRecord(ctx(util))).toEqual({ id: { equals: 20 } });
    expect(ownPartnerRecord(ctx(support))).toBe(false);
    expect(ownPartnerRecord(ctx(anon))).toBe(false);
  });

  it("metierScoped : réservé au métier (isolation métier↔utilisateur)", () => {
    expect(metierScoped()(ctx(admin))).toBe(true);
    expect(metierScoped()(ctx(metier))).toEqual({ partner: { equals: 10 } });
    expect(metierScoped()(ctx(util))).toBe(false);
    expect(metierScoped()(ctx(support))).toBe(false);
  });

  it("utilisateurScoped : réservé à l'utilisateur", () => {
    expect(utilisateurScoped()(ctx(util))).toEqual({ partner: { equals: 20 } });
    expect(utilisateurScoped()(ctx(metier))).toBe(false);
  });

  it("un partenaire SANS fiche rattachée est refusé (pas de fuite)", () => {
    const orphan = { id: 9, roles: ["partner-utilisateur"] };
    expect(utilisateurScoped()(ctx(orphan))).toBe(false);
    expect(ownPartnerRecord(ctx(orphan))).toBe(false);
  });

  it("deux partenaires ont des filtres disjoints", () => {
    const a = { roles: ["partner-metier"], partner: 100 };
    const b = { roles: ["partner-metier"], partner: 200 };
    expect(metierScoped()(ctx(a))).toEqual({ partner: { equals: 100 } });
    expect(metierScoped()(ctx(b))).toEqual({ partner: { equals: 200 } });
  });
});

describe("politiques d'accès (collections)", () => {
  const call = (fn: unknown, user: unknown) => (fn as (a: unknown) => unknown)(ctx(user));

  it("utilisateurOwnedAccess : soumissions/commandes (C·R utilisateur, U·D admin)", () => {
    expect(call(utilisateurOwnedAccess!.read, util)).toEqual({ partner: { equals: 20 } });
    expect(call(utilisateurOwnedAccess!.create, util)).toBe(true);
    expect(call(utilisateurOwnedAccess!.create, metier)).toBe(false);
    expect(call(utilisateurOwnedAccess!.update, util)).toBe(false);
  });

  it("utilisateurReadonlyAccess : création ADMIN-ONLY (anti-exploit reward-orders)", () => {
    expect(call(utilisateurReadonlyAccess!.create, util)).toBe(false);
    expect(call(utilisateurReadonlyAccess!.create, admin)).toBe(true);
    expect(call(utilisateurReadonlyAccess!.read, util)).toEqual({ partner: { equals: 20 } });
  });

  it("metierOwnedAccess : clients gérés par le métier", () => {
    expect(call(metierOwnedAccess!.create, metier)).toBe(true);
    expect(call(metierOwnedAccess!.create, util)).toBe(false);
    expect(call(metierOwnedAccess!.read, metier)).toEqual({ partner: { equals: 10 } });
  });

  it("catalogues : lecture admin + utilisateur", () => {
    expect(canReadCatalog(ctx(util))).toBe(true);
    expect(canReadCatalog(ctx(admin))).toBe(true);
    expect(canReadCatalog(ctx(metier))).toBe(false);
    expect(canReadCatalog(ctx(support))).toBe(false);
  });

  it("support : admin + support", () => {
    expect(canSupport(ctx(support))).toBe(true);
    expect(canSupport(ctx(admin))).toBe(true);
    expect(canSupport(ctx(util))).toBe(false);
  });

  it("isAdmin : booléen strict", () => {
    expect(isAdmin(ctx(admin))).toBe(true);
    expect(isAdmin(ctx(util))).toBe(false);
  });
});

describe("masquage nav (admin.hidden ; true = caché)", () => {
  it("missions/récompenses : visibles utilisateur, cachées métier/support", () => {
    expect(hideUnlessUtilisateur({ user: util })).toBe(false);
    expect(hideUnlessUtilisateur({ user: metier })).toBe(true);
    expect(hideUnlessUtilisateur({ user: support })).toBe(true);
    expect(hideUnlessUtilisateur({ user: admin })).toBe(false);
  });
  it("clients : visibles métier, cachés utilisateur", () => {
    expect(hideUnlessMetier({ user: metier })).toBe(false);
    expect(hideUnlessMetier({ user: util })).toBe(true);
  });
  it("tickets : visibles support, cachés partenaires", () => {
    expect(hideUnlessSupport({ user: support })).toBe(false);
    expect(hideUnlessSupport({ user: util })).toBe(true);
  });
  it("éditorial/système : admins uniquement", () => {
    expect(hideUnlessAdmin({ user: admin })).toBe(false);
    expect(hideUnlessAdmin({ user: util })).toBe(true);
    expect(hideUnlessAdmin({ user: support })).toBe(true);
  });
});

describe("enforcePartnerField (anti-usurpation)", () => {
  const hook = enforcePartnerField() as (a: any) => any;

  it("force le partenaire sur SA fiche, quelle que soit la valeur envoyée", async () => {
    const data = await hook({ data: { partner: 999, note: "x" }, req: { user: metier } });
    expect(data.partner).toBe(10);
  });
  it("ne touche pas les données d'un admin (il cible qui il veut)", async () => {
    const data = await hook({ data: { partner: 999 }, req: { user: admin } });
    expect(data.partner).toBe(999);
  });
});

describe("garde-fous super-admin", () => {
  const countMock = (n: number) => ({ count: async () => ({ totalDocs: n }) });

  it("un non-super ne peut PAS attribuer super-admin s'il en existe déjà", async () => {
    await expect(
      guardSuperAdminOnChange({
        data: { roles: ["super-admin"] },
        originalDoc: { roles: ["admin"] },
        req: { user: admin, payload: countMock(1) },
      } as any),
    ).rejects.toThrow();
  });

  it("bootstrap : un admin peut créer le tout premier super-admin (0 existant)", async () => {
    const data = await guardSuperAdminOnChange({
      data: { roles: ["super-admin"] },
      originalDoc: undefined,
      req: { user: admin, payload: countMock(0) },
    } as any);
    expect(data.roles).toContain("super-admin");
  });

  it("impossible de rétrograder le DERNIER super-admin", async () => {
    await expect(
      guardSuperAdminOnChange({
        data: { roles: ["admin"] },
        originalDoc: { id: 1, roles: ["super-admin"] },
        req: { user: superAdmin, payload: countMock(0) },
      } as any),
    ).rejects.toThrow();
  });

  it("un non-super ne peut pas supprimer un super-admin", async () => {
    const req = {
      user: admin,
      payload: {
        findByID: async () => ({ roles: ["super-admin"] }),
        count: async () => ({ totalDocs: 5 }),
      },
    };
    await expect(guardSuperAdminOnDelete({ req, id: 1 } as any)).rejects.toThrow();
  });

  it("impossible de supprimer le dernier super-admin", async () => {
    const req = {
      user: superAdmin,
      payload: {
        findByID: async () => ({ roles: ["super-admin"] }),
        count: async () => ({ totalDocs: 0 }),
      },
    };
    await expect(guardSuperAdminOnDelete({ req, id: 1 } as any)).rejects.toThrow();
  });

  it("supprimer un utilisateur non super-admin est autorisé", async () => {
    const req = {
      user: admin,
      payload: {
        findByID: async () => ({ roles: ["partner-metier"] }),
        count: async () => ({ totalDocs: 5 }),
      },
    };
    await expect(guardSuperAdminOnDelete({ req, id: 3 } as any)).resolves.toBeUndefined();
  });
});
