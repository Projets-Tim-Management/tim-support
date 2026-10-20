/**
 * Le suivi de lancement d'une campagne (demande de Charlie, 20/10/2026) : de la
 * création à la diffusion, six étapes dont plusieurs se font AILLEURS que sur la
 * fiche (« À valider », Claude Design, l'onglet « Diffusion »). Chacune se
 * constate d'après la base — jamais une case à cocher : l'étape est faite quand
 * le geste a eu lieu. La première non faite est l'étape en cours, avec le bouton
 * qui y mène.
 *
 * Pur, utilisable côté client.
 */

export type LaunchFacts = {
  briefComplete: boolean;
  /** Passages d'agent de la campagne, et l'état du plus récent. */
  runs: number;
  lastRunStatus: string | null;
  /** Créas de la campagne : en attente de validation, validées avec leurs fichiers. */
  creasToValidate: number;
  creasReady: number;
  publicationStatus: string | null;
  previewsSeen: boolean;
};

export type LaunchStepKey = "brief" | "agent" | "creas" | "publier" | "apercus" | "activer";
export type LaunchAction = { kind: "wizard" } | { kind: "tab"; tab: string } | { kind: "link"; href: string };
export type LaunchStep = { key: LaunchStepKey; label: string; done: boolean; current: boolean; detail: string | null; hint: string; action: LaunchAction | null; actionLabel: string | null };

const RUNNING = ["en-cours", "en-pause-budget"];

/** Les six étapes, faites ou non, avec l'étape en cours et ce qui y mène. Pure. */
export function launchSteps(f: LaunchFacts, campaignId: number | string): LaunchStep[] {
  const published = f.publicationStatus === "en-pause" || f.publicationStatus === "active";
  const active = f.publicationStatus === "active";
  const raw: Omit<LaunchStep, "current">[] = [
    {
      key: "brief",
      label: "Brief",
      hint: "Cible, offre, page d'arrivée et budget : ce que l'agent lit pour préparer la campagne.",
      done: f.briefComplete,
      detail: f.briefComplete ? null : "Il manque des informations.",
      action: { kind: "wizard" },
      actionLabel: "Compléter pas à pas",
    },
    {
      key: "agent",
      label: "Agent lancé",
      hint: "L'agent prépare le positionnement, les textes et les briefs Claude Design, puis dépose les créas dans « À valider ».",
      done: f.runs > 0,
      detail: f.lastRunStatus && RUNNING.includes(f.lastRunStatus) ? "L'agent travaille." : f.lastRunStatus === "echoue" ? "Le dernier passage a échoué." : null,
      action: { kind: "tab", tab: "Agent" },
      actionLabel: "Lancer l'agent",
    },
    {
      key: "creas",
      label: "Créas validées",
      hint: "Créez chaque pub dans Claude Design à partir de son brief, importez les fichiers exportés, puis validez.",
      done: f.creasReady > 0 && f.creasToValidate === 0,
      detail: f.creasToValidate ? `${f.creasToValidate} à traiter.` : f.creasReady ? `${f.creasReady} prête(s).` : null,
      action: { kind: "link", href: `/admin/publicite/a-valider?campagne=${encodeURIComponent(String(campaignId))}` },
      actionLabel: "Aller à « À valider »",
    },
    {
      key: "publier",
      label: "Publiée en pause",
      hint: "La campagne, ses ensembles et ses pubs sont créés chez Meta, en pause : rien n'est encore dépensé.",
      done: published,
      detail: f.publicationStatus === "echec" ? "La publication a échoué : reprenez-la." : f.publicationStatus === "en-cours" ? "Publication en cours chez Meta." : null,
      action: { kind: "tab", tab: "Diffusion" },
      actionLabel: "Publier chez Meta",
    },
    {
      key: "apercus",
      label: "Aperçus vérifiés",
      hint: "Regardez les pubs telles que Meta les affichera (fil, Stories, Reels) avant de dépenser le moindre euro.",
      done: f.previewsSeen || active,
      detail: null,
      action: { kind: "tab", tab: "Diffusion" },
      actionLabel: "Voir les aperçus",
    },
    {
      key: "activer",
      label: "Diffusion activée",
      hint: "La diffusion démarre : Meta dépense jusqu'au budget quotidien. « Mettre en pause » l'arrête à tout moment.",
      done: active,
      detail: null,
      action: { kind: "tab", tab: "Diffusion" },
      actionLabel: "Activer la diffusion",
    },
  ];
  // Une créa validée plus tard ne « défait » pas une campagne déjà en ligne : en diffusion, tout est fait.
  const steps = active ? raw.map((s) => ({ ...s, done: true })) : raw;
  const current = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ ...s, current: i === current }));
}
