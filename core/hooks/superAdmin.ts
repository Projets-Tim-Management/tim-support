import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook } from "payload";

import { ROLES, isSuperAdmin } from "@/core/access";

/**
 * Garde-fous du rôle super-admin (voir docs/RBAC-PLAN.md §3).
 *
 * Règles :
 *  1. Seul un super-admin peut ATTRIBUER le rôle super-admin
 *     — EXCEPTION bootstrap : si aucun super-admin n'existe encore, un admin peut
 *       en désigner un (sinon personne ne pourrait créer le premier).
 *  2. Le DERNIER super-admin ne peut être ni supprimé ni rétrogradé
 *     (il doit toujours en rester au moins un).
 *  3. Un non-super-admin ne peut pas supprimer un super-admin.
 */

const rolesArr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

/** Compte les super-admins, en excluant éventuellement un id (celui en cours de modif/suppression). */
async function countSuperAdmins(
  req: Parameters<CollectionBeforeChangeHook>[0]["req"],
  excludeId?: string | number,
): Promise<number> {
  const res = await req.payload.count({
    collection: "users",
    where: {
      and: [
        { roles: { in: [ROLES.superAdmin] } },
        ...(excludeId != null ? [{ id: { not_equals: excludeId } }] : []),
      ],
    },
    overrideAccess: true,
    req,
  });
  return res.totalDocs;
}

export const guardSuperAdminOnChange: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
}) => {
  const nextRoles = rolesArr(data?.roles);
  const prevRoles = rolesArr(originalDoc?.roles);
  const grantingSuper =
    nextRoles.includes(ROLES.superAdmin) && !prevRoles.includes(ROLES.superAdmin);
  const revokingSuper =
    prevRoles.includes(ROLES.superAdmin) && !nextRoles.includes(ROLES.superAdmin);

  // Règle 1 — attribution du rôle super-admin.
  if (grantingSuper && !isSuperAdmin(req.user)) {
    const existing = await countSuperAdmins(req);
    if (existing > 0) {
      throw new Error("Seul un super-admin peut attribuer le rôle super-admin.");
    }
    // Sinon : bootstrap du tout premier super-admin, autorisé.
  }

  // Règle 2 (rétrogradation) — ne pas retirer le rôle au dernier super-admin.
  if (revokingSuper) {
    const remaining = await countSuperAdmins(req, originalDoc?.id);
    if (remaining < 1) {
      throw new Error(
        "Impossible de rétrograder le dernier super-admin : il doit toujours en rester un.",
      );
    }
  }

  return data;
};

export const guardSuperAdminOnDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const target = await req.payload.findByID({
    collection: "users",
    id,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const targetIsSuper = rolesArr((target as { roles?: unknown })?.roles).includes(ROLES.superAdmin);
  if (!targetIsSuper) return;

  // Règle 3 — seul un super-admin peut supprimer un super-admin.
  if (!isSuperAdmin(req.user)) {
    throw new Error("Seul un super-admin peut supprimer un super-admin.");
  }
  // Règle 2 (suppression) — ne pas supprimer le dernier super-admin.
  const remaining = await countSuperAdmins(req, id);
  if (remaining < 1) {
    throw new Error("Impossible de supprimer le dernier super-admin.");
  }
};
