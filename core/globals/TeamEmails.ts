import type { GlobalConfig, Payload } from "payload";

import { isAdmin, isSuperAdminAccess } from "@/core/access";
import { TEAM_EMAIL_OPTIONS, TEAM_EMAILS, TEAM_ROLES, rulesOf, type TeamEmailSettings } from "@/core/lib/team-emails";

/** Libellés des rôles qui peuvent recevoir un e-mail d'équipe (jamais un partenaire utilisateur). */
const ROLE_LABELS: Record<string, string> = { "super-admin": "Super-admin", admin: "Admin", support: "Support" };
const ROLE_OPTIONS = TEAM_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] ?? value }));

/**
 * Système → « E-mails de l'équipe » : pour chaque e-mail interne, les rôles
 * qui le reçoivent, et les deux adresses fixes (groupe d'équipe, support).
 *
 * Semé au démarrage depuis le registre (core/lib/team-emails.ts) : une ligne par
 * e-mail, avec ses rôles par défaut ; un e-mail ajouté au registre apparaît au
 * démarrage suivant, une ligne existante n'est jamais écrasée. Chaque
 * utilisateur peut ensuite remplacer ce défaut par sa propre liste, sur sa fiche.
 * Modifiable par le super-admin, lisible par les admins.
 */
export const TeamEmails: GlobalConfig = {
  slug: "team-emails",
  label: "E-mails de l'équipe",
  admin: {
    group: "Système",
    description:
      "Qui reçoit chaque e-mail interne, selon son rôle. Une personne peut remplacer ce choix par sa propre liste, sur sa fiche (section « E-mails reçus »). Une alerte marquée critique part quand même au super-admin si personne ne la reçoit.",
  },
  access: { read: isAdmin, update: isSuperAdminAccess },
  fields: [
    {
      name: "rules",
      type: "array",
      label: "Par e-mail, les rôles qui le reçoivent",
      labels: { singular: "E-mail", plural: "E-mails" },
      admin: {
        initCollapsed: false,
        components: { RowLabel: "/core/globals/TeamEmailRowLabel#TeamEmailRowLabel" },
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "email",
              type: "select",
              label: "E-mail",
              required: true,
              options: TEAM_EMAIL_OPTIONS,
              admin: {
                width: "50%",
                // La liste suit le registre : on ne choisit pas l'e-mail, on règle ses destinataires.
                readOnly: true,
              },
            },
            {
              name: "roles",
              type: "select",
              label: "Rôles qui le reçoivent",
              hasMany: true,
              options: ROLE_OPTIONS,
              admin: { width: "50%" },
            },
          ],
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "teamAddress",
          type: "email",
          label: "Adresse d'équipe (groupe)",
          admin: { width: "50%", description: "Ajoutée au dernier appel du rapprochement. Vide : team@tim-management.co." },
        },
        {
          name: "supportAddress",
          type: "email",
          label: "Adresse du support",
          admin: { width: "50%", description: "Reçoit les demandes du site et les tickets. Vide : support@tim-management.co." },
        },
      ],
    },
  ],
};

/** Ajoute au réglage les e-mails du registre qui n'y sont pas encore, avec leurs rôles par défaut. Jamais d'écrasement. */
export async function seedTeamEmails(payload: Payload): Promise<void> {
  // Pas pendant un build : plusieurs processus de prérendu sèmeraient en parallèle.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const current = (await payload.findGlobal({ slug: "team-emails" as never, depth: 0, overrideAccess: true })) as TeamEmailSettings;
    const known = rulesOf(current);
    const missing = TEAM_EMAILS.filter((e) => !(e.key in known));
    if (!missing.length) return;
    // L'ordre du registre, lignes existantes comprises : la liste se lit par groupe.
    const rows = TEAM_EMAILS.map((e) => ({ email: e.key, roles: known[e.key] ?? [...e.defaultRoles] }));
    await payload.updateGlobal({ slug: "team-emails" as never, overrideAccess: true, data: { rules: rows } as never });
    payload.logger.info(`[e-mails d'équipe] ${missing.length} e-mail(s) ajouté(s) au réglage.`);
  } catch (err) {
    payload.logger.error(`[e-mails d'équipe] réglage non semé : ${err}`);
  }
}
