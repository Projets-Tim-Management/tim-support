import type { Payload } from "payload";

/**
 * Arme la validation automatique d'une étape depuis un autre module.
 *
 * Les modules qui constatent un fait (l'accès espace client vient d'être créé,
 * le dossier vient d'être transmis) n'ont pas à connaître la forme des étapes
 * d'un parcours : ils nomment la clé, le hook `armAutoSteps` fait le reste.
 *
 * Silencieux par construction : aucun parcours ouvert, ou une écriture qui
 * échoue, ne doit jamais faire échouer le geste métier qui l'a déclenchée.
 */
const OPEN = ["preparation", "en-cours"];

/**
 * Identifiant d'un lien Payload, qu'il soit déjà résolu (objet) ou non (id nu).
 * Selon la profondeur de lecture, le même champ arrive sous les deux formes :
 * chaque appelant refaisait ce test avant d'armer, autant le poser ici.
 */
const idOf = (ref: unknown): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") {
    const id = (ref as { id?: unknown }).id;
    return typeof id === "number" || typeof id === "string" ? id : null;
  }
  return typeof ref === "number" || typeof ref === "string" ? ref : null;
};

export async function armAutoStep(
  payload: Payload,
  client: unknown,
  stepKey: string,
): Promise<void> {
  const clientId = idOf(client);
  if (clientId == null) return;
  try {
    const runs = await payload.find({
      collection: "journey-runs",
      where: { client: { equals: clientId }, status: { in: OPEN } },
      sort: "-createdAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const run = runs.docs[0];
    if (!run) return;

    // Déjà armée (ou déjà faite) : on ne réécrit pas le parcours pour rien.
    // Une génération d'accès crée dix identifiants d'affilée, chacun constatant
    // le même fait — sans ce filtre, dix enregistrements complets du parcours
    // partiraient, hooks compris, pour une seule étape à cocher.
    const step = ((run.steps ?? []) as { key?: string; state?: string }[]).find(
      (s) => s.key === stepKey,
    );
    if (step && (step.state ?? "a-faire") !== "a-faire") return;

    await payload.update({
      collection: "journey-runs",
      id: run.id,
      // `autoSteps` est un champ virtuel lu puis vidé par armAutoSteps.
      data: { autoSteps: [stepKey] } as never,
      overrideAccess: true,
    });
  } catch (err) {
    payload.logger.error(`[parcours] armement automatique de « ${stepKey} » échoué : ${err}`);
  }
}
