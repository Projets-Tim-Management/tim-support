import { META_URL_PARAMS } from "@/modules/ads/lib/download";
import { metaTargeting, OBJECTIFS, OPTIMISATIONS, planProblems, type MediaPlan } from "@/modules/ads/lib/media-plan";
import type { AccountContext, AdPlatform, CreativeMedia } from "@/modules/ads/platforms/types";

/**
 * Publier une campagne chez Meta (plan Publicité, 3b) — le cœur, sans base.
 *
 * Une suite d'étapes, chacune IDEMPOTENTE : on ne crée un objet que si l'état
 * n'en garde pas déjà l'identifiant. Une publication interrompue (fonction
 * coupée, vidéo encore en traitement chez Meta, erreur passagère) reprend donc
 * où elle s'était arrêtée, sans rien créer en double. Tout naît EN PAUSE : la
 * diffusion ne démarre qu'au geste « Activer » de Charlie.
 *
 * Ordre : campagne → ensembles → médias (images envoyées, vidéos cherchées par
 * Meta) → attente du traitement des vidéos → créas → publicités.
 */

export type PubFile = { format: "1x1" | "4x5" | "9x16"; kind: "image" | "video"; url: string; filename?: string | null };
export type PubCrea = {
  id: number | string;
  angle: string;
  cta: string;
  body: string | null;
  title: string | null;
  description: string | null;
  files: PubFile[];
};
export type PubInput = {
  campaign: { id: number | string; name: string; landingUrl: string | null };
  account: { pageId: string | null; instagramId: string | null; pixelId: string | null; canPublish: boolean; problems: string[] };
  plan: MediaPlan | null;
  metaDailyEur: number | null;
  creas: PubCrea[];
  enabled: boolean;
};

export type PubStatus = "en-cours" | "en-pause" | "active" | "echec";
export type MediaRef = { kind: "image" | "video"; hash?: string; videoId?: string; thumbnailUrl?: string | null; ready: boolean };
export type PubState = {
  status: PubStatus;
  error: string | null;
  campaignId: string | null;
  adsets: string[];
  media: Record<string, MediaRef>;
  creatives: Record<string, string>;
  ads: Record<string, string>;
  /** Ce qui a été fait, dans l'ordre : le journal de la publication. */
  history: { at: string; line: string }[];
  plan: MediaPlan | null;
  creas: (number | string)[];
  publishedAt: string | null;
  activatedAt: string | null;
  /** Première fois que les aperçus de Meta ont été affichés : une étape du suivi de lancement. */
  previewsSeenAt?: string | null;
  /**
   * Les publicités AJOUTÉES à la campagne en ligne (créas renouvelées, §9 nonies
   * étape 5) et déjà activées : leur clé dans `ads`. Une ajoutée naît en pause
   * comme les autres ; elle ne passe active qu'une fois notée ici.
   */
  liveAds?: string[];
};

export const emptyState = (input: PubInput): PubState => ({
  status: "en-cours",
  error: null,
  campaignId: null,
  adsets: [],
  media: {},
  creatives: {},
  ads: {},
  history: [],
  plan: input.plan,
  creas: input.creas.map((c) => c.id),
  publishedAt: null,
  activatedAt: null,
});

/** Ce qui empêche de publier, dit avant le clic. Vide : on peut publier. Pure. */
export function publishProblems(i: PubInput): string[] {
  const out: string[] = [];
  if (!i.enabled) out.push("L'interrupteur général de la publicité est coupé.");
  out.push(...i.account.problems);
  if (!i.plan) out.push("Aucun plan de diffusion proposé par l'agent (objectif, ensembles, ciblage).");
  else {
    out.push(...planProblems(i.plan, { metaDailyEur: i.metaDailyEur, hasPixel: Boolean(i.account.pixelId) }));
    if (OBJECTIFS[i.plan.objectif]?.site && !i.campaign.landingUrl) out.push("Cet objectif mène au site : renseignez la page d'arrivée dans le brief.");
  }
  if (!i.metaDailyEur || i.metaDailyEur <= 0) out.push("Aucun budget Meta quotidien : l'agent le propose dans la répartition du budget.");
  if (!i.creas.length) out.push("Aucune créa validée avec ses fichiers.");
  for (const c of i.creas) if (!c.body || !c.title) out.push(`Créa C${c.id} : il manque un texte principal ou un titre passé aux garde-fous.`);
  return out;
}

/** Les natures d'une créa (vidéo, image) et leurs fichiers. Pure. */
export const kindsOf = (c: PubCrea) => (["video", "image"] as const).filter((k) => c.files.some((f) => f.kind === k));

/** Les centres d'intérêt que Meta dit retirés de son catalogue, d'après son message d'erreur. Pure. */
export const deprecatedInterests = (message: string): string[] => [...message.matchAll(/"deprecated_interest_id"\s*:\s*"?(\d+)/g)].map((m) => m[1]);

export type Deps = { platform: AdPlatform; acc: AccountContext; now: () => Date; deadline: number };

/** Une étape a été faite : on la note, on garde l'état (le chemin le plus court vers la reprise). */
type Save = (s: PubState) => Promise<void>;

/**
 * Fait avancer la publication autant que possible. Rend l'état final : « en-pause »
 * quand tout est créé, « en-cours » s'il faut revenir (vidéo en traitement, délai
 * dépassé). Lève sur une erreur de la régie — l'appelant passe l'état en échec ;
 * les identifiants déjà obtenus restent, la reprise repartira de là.
 */
export async function advance(state: PubState, input: PubInput, d: Deps, save: Save): Promise<PubState> {
  const p = d.platform;
  if (!p.createCampaign || !p.createAdSet || !p.uploadImage || !p.uploadVideo || !p.videoState || !p.createCreative || !p.createAd) {
    throw new Error(`${p.label} : la publication n'est pas branchée.`);
  }
  const plan = state.plan ?? input.plan;
  if (!plan) throw new Error("Aucun plan de diffusion.");
  const s: PubState = { ...state, plan, status: "en-cours", error: null };
  const note = async (line: string) => {
    s.history = [...s.history, { at: d.now().toISOString(), line }];
    await save(s);
  };
  const late = () => Date.now() > d.deadline;
  const def = OBJECTIFS[plan.objectif];
  const opt = OPTIMISATIONS[plan.optimisation];

  // 1. La campagne.
  if (!s.campaignId) {
    s.campaignId = await p.createCampaign(d.acc, { name: input.campaign.name, objective: def.meta });
    await note(`Campagne créée chez Meta (${def.label}).`);
  }

  // 2. Les ensembles, dans l'ordre du plan.
  for (const [i, planned] of plan.ensembles.entries()) {
    if (s.adsets[i]) continue;
    let e = planned;
    const daily = Math.round(((input.metaDailyEur ?? 0) * e.part) / 100 * 100) / 100;
    const create = () =>
      p.createAdSet!(d.acc, {
        campaignId: s.campaignId!,
        name: e.nom,
        dailyBudget: daily,
        optimizationGoal: opt.meta,
        billingEvent: "IMPRESSIONS",
        targeting: metaTargeting(e),
        promotedObject:
          plan.optimisation === "conversions" && input.account.pixelId
            ? { pixel_id: input.account.pixelId, custom_event_type: "LEAD" }
            : !def.site && input.account.pageId
              ? { page_id: input.account.pageId }
              : null,
        destinationType: def.site ? "WEBSITE" : null,
      });
    try {
      s.adsets[i] = await create();
    } catch (err) {
      // Meta retire des centres d'intérêt de son catalogue : on les enlève du ciblage —
      // sans prendre l'« alternative » proposée, qui ne vise pas le même public — et on réessaie une fois.
      const gone = deprecatedInterests((err as Error).message);
      const dropped = e.interets.filter((x) => gone.includes(String(x.id)));
      if (!dropped.length) throw err;
      e = { ...e, interets: e.interets.filter((x) => !gone.includes(String(x.id))) };
      s.plan = { ...s.plan!, ensembles: s.plan!.ensembles.map((x, j) => (j === i ? e : x)) };
      await note(`Centre d'intérêt retiré par Meta, enlevé du ciblage de « ${e.nom} » : ${dropped.map((x) => `« ${x.name} »`).join(", ")}.`);
      s.adsets[i] = await create();
    }
    s.adsets = [...s.adsets];
    await note(`Ensemble « ${e.nom} » créé (${daily.toFixed(2)} € par jour).`);
    if (late()) return s;
  }

  // 3 à 6. Médias, traitement des vidéos, créas, publicités.
  if (!(await placeCreas(s, input.creas, plan, input, d, note, save))) return s;

  s.status = "en-pause";
  s.publishedAt = d.now().toISOString();
  await note(`Publiée chez Meta, EN PAUSE : ${Object.keys(s.ads).length} publicité(s) dans ${plan.ensembles.length} ensemble(s). Vérifiez les aperçus, puis « Activer ».`);
  return s;
}

/**
 * Médias, traitement des vidéos, créas, puis publicités — pour `creas`, dans
 * chaque ensemble déjà créé. Idempotent comme le reste. Rend `false` s'il faut
 * revenir (vidéo en traitement, délai dépassé), `true` quand tout est posé.
 * Une publicité naît EN PAUSE (createAd) : c'est l'appelant qui décide de
 * l'activer.
 */
async function placeCreas(s: PubState, creas: PubCrea[], plan: MediaPlan, input: PubInput, d: Deps, note: (line: string) => Promise<void>, save: Save): Promise<boolean> {
  const p = d.platform as Required<Pick<AdPlatform, "uploadImage" | "uploadVideo" | "videoState" | "createCreative" | "createAd">> & AdPlatform;
  const late = () => Date.now() > d.deadline;
  const def = OBJECTIFS[plan.objectif];
  // 3. Les médias : une image s'envoie, une vidéo est cherchée par Meta à son adresse.
  for (const c of creas)
    for (const f of c.files) {
      if (s.media[f.url]) continue;
      const name = f.filename ?? `C${c.id}-${f.format}`;
      s.media[f.url] = f.kind === "image" ? { kind: "image", hash: (await p.uploadImage(d.acc, f.url, name)).hash, ready: true } : { kind: "video", videoId: (await p.uploadVideo(d.acc, f.url, name)).id, ready: false };
      s.media = { ...s.media };
      await note(`${f.kind === "image" ? "Image" : "Vidéo"} ${name} envoyée.`);
      if (late()) return false;
    }

  // 4. Les vidéos, jusqu'à la fin de leur traitement chez Meta (et leur vignette).
  for (const [url, m] of Object.entries(s.media)) {
    if (m.kind !== "video" || m.ready) continue;
    const v = await p.videoState(d.acc, m.videoId!);
    if (v.error) throw new Error(`Vidéo refusée par Meta : ${v.error}`);
    if (!v.ready) {
      await note("Vidéo en cours de traitement chez Meta : reprise dans une minute.");
      return false;
    }
    s.media = { ...s.media, [url]: { ...m, ready: true, thumbnailUrl: v.thumbnailUrl } };
    await save(s);
  }

  // 5. Les créas : une par créa et par nature (vidéo, image), chaque format à sa place.
  for (const c of creas)
    for (const kind of kindsOf(c)) {
      const key = `${c.id}:${kind}`;
      if (s.creatives[key]) continue;
      const media: CreativeMedia[] = c.files
        .filter((f) => f.kind === kind)
        .map((f) => {
          const m = s.media[f.url];
          return kind === "video" ? { format: f.format, video: { id: m.videoId!, thumbnailUrl: m.thumbnailUrl ?? null } } : { format: f.format, image: { hash: m.hash! } };
        });
      s.creatives = {
        ...s.creatives,
        [key]: await p.createCreative(d.acc, {
          name: `C${c.id} ${kind === "video" ? "vidéo" : "image"} — ${c.angle}`.slice(0, 100),
          pageId: input.account.pageId!,
          instagramId: input.account.instagramId,
          kind,
          media,
          body: c.body!,
          title: c.title!,
          description: c.description,
          link: def.site ? input.campaign.landingUrl : null,
          urlTags: def.site ? META_URL_PARAMS : null,
          cta: c.cta,
        }),
      };
      await note(`Créa C${c.id} (${kind === "video" ? "vidéo" : "image"}) créée.`);
      if (late()) return false;
    }

  // 6. Les publicités : chaque créa dans chaque ensemble.
  for (const [i, e] of plan.ensembles.entries())
    for (const c of creas)
      for (const kind of kindsOf(c)) {
        const key = `${c.id}:${kind}:${i}`;
        if (s.ads[key]) continue;
        s.ads = { ...s.ads, [key]: await p.createAd(d.acc, { name: `C${c.id} ${kind === "video" ? "vidéo" : "image"} — ${e.nom}`.slice(0, 100), adSetId: s.adsets[i], creativeId: s.creatives[`${c.id}:${kind}`] }) };
        await save(s);
        if (late()) return false;
      }

  return true;
}

/**
 * Ajoute des créas validées à une campagne DÉJÀ EN DIFFUSION (plan, §9 nonies,
 * étape 5) : médias, créas et publicités dans chaque ensemble existant, puis
 * chaque nouvelle publicité passe active — la campagne et ses ensembles ne
 * bougent pas. Idempotent : rejoué chaque minute jusqu'au bout. Rend les créas
 * posées entièrement à ce passage.
 */
export async function advanceAdditions(state: PubState, creas: PubCrea[], input: PubInput, d: Deps, save: Save): Promise<{ state: PubState; placed: (number | string)[]; done: boolean }> {
  const p = d.platform;
  if (!p.uploadImage || !p.uploadVideo || !p.videoState || !p.createCreative || !p.createAd || !p.setStatus) throw new Error(`${p.label} : l'ajout de publicités n'est pas branché.`);
  if (state.status !== "active" || !state.plan || !state.adsets.length) throw new Error("La campagne n'est pas en diffusion : rien à quoi ajouter.");
  const s: PubState = { ...state, liveAds: [...(state.liveAds ?? [])] };
  const note = async (line: string) => {
    s.history = [...s.history, { at: d.now().toISOString(), line }];
    await save(s);
  };
  if (!(await placeCreas(s, creas, s.plan!, input, d, note, save))) return { state: s, placed: [], done: false };
  const placed: (number | string)[] = [];
  for (const c of creas) {
    for (const [i] of s.plan!.ensembles.entries())
      for (const kind of kindsOf(c)) {
        const key = `${c.id}:${kind}:${i}`;
        if (s.liveAds!.includes(key)) continue;
        await p.setStatus(d.acc, { level: "ad", externalId: s.ads[key] }, "active");
        s.liveAds = [...s.liveAds!, key];
        await save(s);
      }
    if (!s.creas.map(String).includes(String(c.id))) {
      s.creas = [...s.creas, c.id];
      placed.push(c.id);
      await note(`Créa C${c.id} ajoutée à la campagne en ligne : ${kindsOf(c).length * s.plan!.ensembles.length} publicité(s) actives.`);
    }
  }
  return { state: s, placed, done: true };
}
