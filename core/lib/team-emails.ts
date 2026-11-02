import type { Payload } from "payload";

import { ROLES, type Role } from "@/core/access";

/**
 * Les e-mails D'ÉQUIPE — registre unique : chacun a une clé, un libellé, ce
 * qui le déclenche, et les rôles qui le reçoivent par défaut.
 *
 * Avant, chaque envoi partait « à tous les admins » ; comme le rôle Admin est
 * donné par défaut, tout le monde recevait tout. Désormais l'envoi demande
 * `teamRecipients(payload, clé)`, et la réponse vient des réglages :
 *  - Système → « E-mails de l'équipe » : pour chaque e-mail, les rôles qui le
 *    reçoivent (semé avec les valeurs par défaut ci-dessous, jamais écrasé) ;
 *  - la fiche de chaque utilisateur : « comme mon rôle » (défaut) ou une liste
 *    personnelle d'e-mails cochés.
 * Un e-mail ajouté ici apparaît seul dans les réglages au démarrage suivant —
 * après sa migration : les clés sont des enums Postgres (le choix du réglage et
 * la liste personnelle des fiches), une clé nouvelle coûte un `ALTER TYPE …
 * ADD VALUE` (scripts/db-migrate-additive.ts le génère).
 *
 * Les e-mails aux clients et aux prospects (accusés, codes, parcours,
 * séquences) ne passent pas par ici : ils vont à leur destinataire naturel.
 */

export type TeamEmail = {
  key: string;
  label: string;
  /** Ce qui le déclenche, en une phrase — affiché dans les réglages. */
  when: string;
  group: "Facturation" | "Parcours client" | "Publicité" | "Agendas";
  defaultRoles: Role[];
  /**
   * Une alerte qu'on ne doit pas perdre : si personne n'est coché, elle part
   * quand même au super-admin.
   */
  critical?: boolean;
};

const ADMINS: Role[] = [ROLES.superAdmin, ROLES.admin];

export const TEAM_EMAILS = [
  { key: "rapprochement-mois", group: "Facturation", label: "Rapprochement : factures du mois à valider", when: "Le 1er du mois à 6 h 50, s'il reste des factures à signer.", defaultRoles: ADMINS },
  {
    key: "rapprochement-dernier-appel",
    group: "Facturation",
    label: "Rapprochement : dernier appel avant une facture",
    when: "2 jours avant une facture encore non signée (envoyé aussi à l'adresse d'équipe).",
    defaultRoles: ADMINS,
    critical: true,
  },
  { key: "contrat-a-contresigner", group: "Facturation", label: "Contrat à contresigner", when: "Dès qu'un client signe son contrat.", defaultRoles: ADMINS, critical: true },
  { key: "parcours-go-nogo", group: "Parcours client", label: "Go / No-Go de la phase de test", when: "Quand un parcours arrive à la validation de fin de test.", defaultRoles: ADMINS },
  { key: "parcours-devis", group: "Parcours client", label: "Devis à rédiger", when: "Quand un client demande un devis dans son parcours.", defaultRoles: ADMINS },
  { key: "parcours-contrat", group: "Parcours client", label: "Contrat à établir", when: "Quand un parcours arrive à l'étape du contrat.", defaultRoles: ADMINS },
  { key: "parcours-dossier", group: "Parcours client", label: "Dossier de démarrage à vérifier", when: "Quand un client envoie son dossier de démarrage.", defaultRoles: ADMINS },
  { key: "parcours-prise-en-main", group: "Parcours client", label: "Prise en main calée", when: "Quand un client réserve sa séance de prise en main.", defaultRoles: ADMINS },
  { key: "parcours-acces-manquants", group: "Parcours client", label: "Accès manquants", when: "Vérifié chaque heure : des accès client manquent.", defaultRoles: ADMINS, critical: true },
  { key: "parcours-etapes", group: "Parcours client", label: "Étapes de mise en production", when: "À chaque étape franchie d'une mise en production.", defaultRoles: ADMINS },
  { key: "publicite-urgence", group: "Publicité", label: "Publicité : urgence sur une campagne", when: "Après la synchro de nuit, une fois par alerte.", defaultRoles: ADMINS, critical: true },
  { key: "publicite-reconnexion", group: "Publicité", label: "Publicité : compte ou jeton à reconnecter", when: "7 jours avant l'expiration d'une connexion.", defaultRoles: ADMINS, critical: true },
  { key: "publicite-recap", group: "Publicité", label: "Publicité : récap du lundi", when: "Chaque lundi matin.", defaultRoles: ADMINS },
  { key: "agendas", group: "Agendas", label: "Agendas : connexion cassée ou visio sans lien", when: "Chaque jour à 8 h 15, seulement en cas de problème.", defaultRoles: ADMINS, critical: true },
] as const satisfies readonly TeamEmail[];

export type TeamEmailKey = (typeof TEAM_EMAILS)[number]["key"];

/** Les rôles internes à TIM : seuls eux reçoivent des e-mails d'équipe (jamais un partenaire utilisateur). */
export const TEAM_ROLES: Role[] = [ROLES.superAdmin, ROLES.admin, ROLES.support, ROLES.partnerMetier];

export const teamEmail = (key: string): TeamEmail | undefined => (TEAM_EMAILS as readonly TeamEmail[]).find((e) => e.key === key);

/** Les options d'un champ select : « Facturation — Contrat à contresigner ». */
export const TEAM_EMAIL_OPTIONS = TEAM_EMAILS.map((e) => ({ value: e.key, label: `${e.group} — ${e.label}` }));

export type TeamUser = {
  email?: string | null;
  roles?: string[] | null;
  /** « role » (défaut) : selon les rôles ; « custom » : la liste ci-dessous. */
  teamEmailsMode?: string | null;
  teamEmails?: string[] | null;
};

/** Pour chaque e-mail, les rôles qui le reçoivent (réglages) ; un e-mail absent garde ses rôles par défaut. */
export type RoleRules = Record<string, string[]>;

/**
 * Qui reçoit `key` : chaque utilisateur interne selon son réglage — sa liste
 * personnelle, ou ses rôles. Sans doublon (comparaison en minuscules). Une
 * alerte critique sans personne part au super-admin. Pure.
 */
export function resolveTeamRecipients(key: string, users: TeamUser[], rules: RoleRules): string[] {
  const def = teamEmail(key);
  const roles = rules[key] ?? def?.defaultRoles ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (email?: string | null) => {
    const e = email?.trim();
    if (!e || seen.has(e.toLowerCase())) return;
    seen.add(e.toLowerCase());
    out.push(e);
  };
  for (const u of users) {
    const mine = u.roles ?? [];
    if (!mine.some((r) => (TEAM_ROLES as string[]).includes(r))) continue;
    const wants = u.teamEmailsMode === "custom" ? (u.teamEmails ?? []).includes(key) : mine.some((r) => roles.includes(r));
    if (wants) add(u.email);
  }
  if (!out.length && def?.critical) for (const u of users) if ((u.roles ?? []).includes(ROLES.superAdmin)) add(u.email);
  return out;
}

export type TeamEmailSettings = {
  rules?: { email?: string | null; roles?: string[] | null }[] | null;
  /** L'adresse d'équipe (groupe Workspace) jointe au dernier appel du rapprochement. */
  teamAddress?: string | null;
  /** Où arrivent les demandes du site et les tickets. */
  supportAddress?: string | null;
};

export const rulesOf = (s: TeamEmailSettings | null | undefined): RoleRules =>
  Object.fromEntries((s?.rules ?? []).filter((r) => r.email).map((r) => [r.email!, r.roles ?? []]));

/** Le réglage ; null s'il est illisible (table pas encore migrée…) : chacun retombe alors sur les rôles par défaut. */
export async function loadTeamEmailSettings(payload: Payload): Promise<TeamEmailSettings | null> {
  try {
    return (await payload.findGlobal({ slug: "team-emails" as never, depth: 0, overrideAccess: true })) as TeamEmailSettings;
  } catch {
    return null;
  }
}

/** Les destinataires d'un e-mail d'équipe, d'après les réglages et les fiches utilisateurs. */
export async function teamRecipients(payload: Payload, key: TeamEmailKey): Promise<string[]> {
  const [settings, users] = await Promise.all([
    loadTeamEmailSettings(payload),
    payload.find({
      collection: "users",
      where: { roles: { in: TEAM_ROLES } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
      select: { email: true, roles: true, teamEmailsMode: true, teamEmails: true } as never,
    }),
  ]);
  return resolveTeamRecipients(key, users.docs as TeamUser[], rulesOf(settings));
}

/** L'adresse d'équipe (réglage, sinon BILLING_REMINDER_TEAM_EMAIL, sinon team@). */
export async function teamAddress(payload: Payload): Promise<string> {
  const s = await loadTeamEmailSettings(payload);
  return (s?.teamAddress || process.env.BILLING_REMINDER_TEAM_EMAIL || "team@tim-management.co").trim();
}

/** Où arrivent les demandes du site et les tickets (réglage, sinon TICKETS_NOTIFY_EMAIL, sinon l'adresse d'envoi). */
export async function supportAddress(payload: Payload): Promise<string> {
  const s = await loadTeamEmailSettings(payload);
  return (s?.supportAddress || process.env.TICKETS_NOTIFY_EMAIL || process.env.EMAIL_FROM || "support@tim-management.co").trim();
}
