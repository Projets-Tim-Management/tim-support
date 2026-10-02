/**
 * Parcours « Formation » — SOURCE DE VÉRITÉ des listes et des règles pures.
 *
 * Troisième parcours d'un client, FACULTATIF : il n'existe que si l'entreprise a
 * une formation (payée ou offerte). Il ne vit PAS dans `journey-runs` : une
 * vingtaine d'endroits y lisent « pas une mise en production, donc un test »
 * (statut de la fiche, e-mails programmés, agenda, tableau de bord). Une
 * formation glissée là repasserait une fiche « En test ». Elle a donc ses
 * collections — `trainings`, `training-days`, `training-sessions` — et ne
 * touche jamais au statut de la fiche.
 *
 * Plan complet et décisions : docs/PLAN-FORMATION.md.
 *
 * Module pur (aucun import serveur) : lu par les collections, les routes et
 * l'admin.
 */

import { PROFILS, type ProfilKey } from "@/modules/partner/lib/pricing";

/** Statut du parcours formation d'un client. */
export const TRAINING_STATUSES = [
  { value: "ouvert", label: "Formation en cours" },
  { value: "termine", label: "Formation terminée" },
  { value: "annule", label: "Formation annulée" },
] as const;

export type TrainingStatus = (typeof TRAINING_STATUSES)[number]["value"];

export const isTrainingClosed = (status?: string | null): boolean => status === "termine" || status === "annule";

/** Une journée se tient sur place ou à distance — choisi journée par journée. */
export const TRAINING_MODES = [
  { value: "sur-place", label: "Sur place" },
  { value: "distance", label: "À distance" },
] as const;

/** Qui forme : l'équipe TIM ou le partenaire du client. */
export const TRAINER_TYPES = [
  { value: "tim", label: "Équipe TIM" },
  { value: "partenaire", label: "Partenaire" },
] as const;

/**
 * Qui remet les identifiants aux participants. Valeur par défaut sur le
 * parcours, modifiable séance par séance (décision du 01/10/2026).
 */
export const ACCESS_DELIVERY = [
  { value: "formateur", label: "Le formateur, pendant la séance" },
  { value: "client", label: "Le client, avant la séance" },
] as const;

export type AccessDelivery = (typeof ACCESS_DELIVERY)[number]["value"];

export const SESSION_STATUSES = [
  { value: "planifiee", label: "Planifiée" },
  { value: "realisee", label: "Réalisée" },
  { value: "annulee", label: "Annulée" },
] as const;

/** Profils formés : ceux de la grille tarifaire, dans l'ordre hiérarchique. */
export const TRAINING_PROFILE_OPTIONS = PROFILS.map(({ key, label }) => ({ label, value: key }));

/**
 * Profil de licence → profil du parcours d'apprentissage éditorial (site
 * support), d'où sont tirés le programme et le mémo « Bien démarrer ».
 *
 * Le chef d'équipe n'a pas de parcours éditorial : il prend celui du chef de
 * chantier, le plus proche de son quotidien (à confirmer avec l'équipe).
 */
export const PROFILE_TO_PARCOURS: Record<ProfilKey, string> = {
  admin: "admin",
  conducteur: "conducteur",
  chefChantier: "chef-chantier",
  chefEquipe: "chef-chantier",
  compagnon: "compagnon",
};

/**
 * L'adresse PUBLIQUE du guide, pour les liens qui partent sur papier ou par
 * e-mail (fiches de rôle, après-formation). Jamais l'adresse du site en cours
 * (`NEXT_PUBLIC_SITE_URL`) : en développement elle vaut « localhost:3001 », et
 * une fiche imprimée ou un e-mail envoyé depuis là renvoyait vers une page
 * inaccessible. `PUBLIC_GUIDE_URL` permet de viser une autre adresse si besoin.
 */
export const GUIDE_URL = (process.env.PUBLIC_GUIDE_URL || "https://support.tim-management.co").replace(/\/$/, "");

/** Durée estimée par fonctionnalité enseignée, à défaut de programme réel. */
export const MINUTES_PER_FEATURE = 10;

type ParcoursDoc = {
  id?: number | string | null;
  title?: string | null;
  profil?: string | null;
  order?: number | null;
  steps?: unknown[] | null;
};

type ProgrammeModule = { title: string; minutes: number; parcours: number | string | null };

/**
 * Programme par profil, BROUILLON tiré des parcours éditoriaux.
 *
 * Il n'existe pas encore de programme type : chaque parcours d'apprentissage du
 * profil devient un module, dans leur ordre, d'une durée estimée à
 * `MINUTES_PER_FEATURE` par fonctionnalité qu'il enseigne. TIM ajuste ensuite
 * dans Système → Formation. Un profil sans parcours reçoit un programme vide
 * plutôt qu'inventé.
 *
 * Le titre éditorial « Parcours 2 — Ouvrir l'outil à l'équipe » devient
 * « Ouvrir l'outil à l'équipe » : la numérotation du site n'a pas de sens dans
 * un programme de séance.
 */
export function programmesFromParcours(parcours: ParcoursDoc[]): { profile: ProfilKey; modules: ProgrammeModule[] }[] {
  const sorted = [...parcours].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return PROFILS.map(({ key }) => ({
    profile: key,
    modules: sorted
      .filter((p) => p.profil === PROFILE_TO_PARCOURS[key] && p.title)
      .map((p) => ({
        title: moduleTitle(String(p.title)),
        minutes: Math.max(1, (p.steps ?? []).filter(Boolean).length) * MINUTES_PER_FEATURE,
        parcours: p.id ?? null,
      })),
  }));
}

/** « Parcours 2.1 — Pointer… » → « Pointer… » (préfixe éditorial retiré). */
export const moduleTitle = (title: string): string =>
  title.replace(/^\s*parcours\s+[\d.]+\s*[—–-]\s*/i, "").trim() || title.trim();

/**
 * La formation se fait logiquement APRÈS l'activation du compte de production
 * (on forme sur de vrais comptes). Elle reste ouvrable avant : on avertit, on
 * ne bloque pas.
 */
export const trainingBeforeActivation = (clientStatus?: string | null): boolean => clientStatus !== "actif";
