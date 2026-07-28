import type { ServerProps } from "payload";

import { Gutter } from "@payloadcms/ui";

import {
  PARCOURS_PROFIL_LABEL,
  PARCOURS_PROFIL_VALUES,
} from "@/modules/editorial/lib/parcours-profils";

import { ParcoursTabs, type ParcoursGroup } from "./ParcoursTabs";

/**
 * Vue liste custom des Parcours (admin.components.views.list.Component).
 *
 * Remplace le tableau par des ONGLETS par profil cible (Admin, Conducteur, …).
 * Chaque onglet liste ses parcours en cartes, avec leurs étapes réordonnables.
 * Server component : lecture via la Local API (depth 1 → titres des features) ;
 * le rendu interactif (onglets, drag) est délégué à ParcoursTabs (client).
 */

type FeatureStep = { id: number | string; title?: string };
type ParcoursDoc = {
  id: number | string;
  title?: string;
  profil?: string;
  intro?: string;
  _status?: string;
  steps?: (FeatureStep | number | string)[];
};

type Props = ServerProps & { hasCreatePermission?: boolean };

const PROFIL_LABEL = PARCOURS_PROFIL_LABEL;
const PROFIL_ORDER = PARCOURS_PROFIL_VALUES;
const OTHER_KEY = "_autres";
const CREATE_URL = "/admin/collections/parcours/create";

export default async function ParcoursListView(props: Props) {
  const { payload, user, hasCreatePermission } = props;

  const { docs, totalDocs } = await payload.find({
    collection: "parcours",
    sort: "order",
    depth: 1, // peuple les steps (features) → titres
    limit: 200,
    pagination: false,
    overrideAccess: false,
    user,
  });

  const parcours = docs as ParcoursDoc[];

  // Un bucket par profil (toujours présents, même vides), + « Autres » au besoin.
  const buckets = new Map<string, ParcoursDoc[]>(PROFIL_ORDER.map((k) => [k, []]));
  for (const p of parcours) {
    const key = p.profil && PROFIL_LABEL[p.profil] ? p.profil : OTHER_KEY;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(p);
  }
  const keys = [...PROFIL_ORDER, ...(buckets.get(OTHER_KEY)?.length ? [OTHER_KEY] : [])];

  const groups: ParcoursGroup[] = keys.map((key) => ({
    key,
    label: key === OTHER_KEY ? "Autres / sans profil" : PROFIL_LABEL[key],
    createHref: key === OTHER_KEY ? CREATE_URL : `${CREATE_URL}?profil=${key}`,
    parcours: (buckets.get(key) ?? []).map((p) => ({
      id: p.id,
      title: p.title || "(sans titre)",
      intro: p.intro || "",
      isDraft: p._status === "draft",
      steps: (Array.isArray(p.steps) ? p.steps : []).map((s) =>
        s && typeof s === "object" ? { id: s.id, title: s.title } : { id: s },
      ),
    })),
  }));

  return (
    <Gutter>
      <div className="parcours-view">
        <header className="parcours-view__header">
          <div>
            <h1 className="parcours-view__heading">Parcours</h1>
            <p className="parcours-view__subtitle">
              {totalDocs} parcours · classés par profil cible.
            </p>
          </div>
        </header>

        <ParcoursTabs groups={groups} canCreate={Boolean(hasCreatePermission)} />
      </div>
    </Gutter>
  );
}
