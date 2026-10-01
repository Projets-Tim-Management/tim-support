import type { GlobalConfig, Payload } from "payload";

import { isAdmin } from "@/core/access";
import { MINUTES_PER_FEATURE, TRAINING_PROFILE_OPTIONS, programmesFromParcours } from "@/modules/training/lib/training";

/**
 * Système → « Formation » : le programme type par profil.
 *
 * Il n'existait pas de programme : celui-ci est SEMÉ au démarrage depuis les
 * parcours d'apprentissage du site support (un module par parcours, 10 min par
 * fonctionnalité enseignée), puis ajusté ici par TIM. Jamais écrasé ensuite.
 * Le programme d'une séance assemble ceux des profils qu'elle forme ; le mémo
 * « Bien démarrer » en tire les gestes essentiels.
 *
 * Réservé à TIM.
 */
export const TrainingSettings: GlobalConfig = {
  slug: "training-settings",
  label: "Formation",
  admin: {
    group: "Système",
    description:
      "Le programme type de chaque profil, prérempli depuis les parcours d'apprentissage du site support. Il sert au programme des séances et au mémo « Bien démarrer ». Réservé à TIM.",
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    {
      name: "programmes",
      type: "array",
      label: "Programme par profil",
      labels: { singular: "Programme", plural: "Programmes" },
      fields: [
        {
          name: "profile",
          type: "select",
          label: "Profil",
          required: true,
          options: TRAINING_PROFILE_OPTIONS,
        },
        {
          name: "modules",
          type: "array",
          label: "Modules",
          labels: { singular: "Module", plural: "Modules" },
          fields: [
            {
              type: "row",
              fields: [
                { name: "title", type: "text", label: "Intitulé", required: true, admin: { width: "50%" } },
                {
                  name: "minutes",
                  type: "number",
                  label: "Durée (min)",
                  min: 5,
                  defaultValue: MINUTES_PER_FEATURE,
                  admin: { width: "14%" },
                },
                {
                  // Le parcours d'apprentissage qu'il reprend : ses fonctionnalités
                  // donnent les gestes du mémo « Bien démarrer » et leurs QR codes.
                  name: "parcours",
                  type: "relationship",
                  relationTo: "parcours",
                  label: "Parcours du support",
                  admin: { width: "18%" },
                },
                {
                  // Ou une page précise, pour un module ajouté à la main.
                  name: "feature",
                  type: "relationship",
                  relationTo: "features",
                  label: "Ou une page",
                  admin: { width: "18%" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** Sème le programme depuis les parcours éditoriaux publiés, s'il est vide. */
export async function seedTrainingSettings(payload: Payload): Promise<void> {
  // Pas pendant un build : le prérendu lance plusieurs processus en parallèle,
  // chacun trouvait le global vide et le semait — deux lignes de réglage au
  // premier build du 01/10/2026. Le premier démarrage du serveur s'en charge.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const current = (await payload.findGlobal({ slug: "training-settings", depth: 0, overrideAccess: true })) as {
      programmes?: unknown[];
    };
    if (current?.programmes?.length) return;
    const parcours = await payload.find({
      collection: "parcours",
      depth: 0,
      limit: 100,
      draft: false,
      where: { _status: { equals: "published" } },
      overrideAccess: true,
    });
    const programmes = programmesFromParcours(parcours.docs as never);
    await payload.updateGlobal({
      slug: "training-settings",
      overrideAccess: true,
      data: { programmes } as never,
    });
    const modules = programmes.reduce((n, p) => n + p.modules.length, 0);
    payload.logger.info(`[formation] programme type semé (${modules} modules, depuis ${parcours.docs.length} parcours).`);
  } catch (err) {
    // Cas normal avant la migration : la table n'existe pas encore.
    payload.logger.error(`[formation] seed du programme échoué : ${err}`);
  }
}
