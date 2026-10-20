import type { Payload } from "payload";

import { anonymousSummary, type ClientIn, type LeadIn } from "@/modules/ads/agent/sources/acquisition";
import { searchAdLibrary } from "@/modules/ads/agent/sources/ad-library";
import { FETCH_TIMEOUT_MS } from "@/modules/ads/agent/limits";
import { readSite, siteFetcher } from "@/modules/ads/agent/sources/site";
import type { SourcesPort } from "@/modules/ads/agent/types";
import { accountContext, AccountUnavailable } from "@/modules/ads/lib/account-access";

/**
 * Le port des sources du stratège, branché sur la base et sur le réseau.
 *
 * Les fiches clients ne sont lues QUE par les champs dont les agrégats ont
 * besoin (`select`) : ni nom, ni SIREN, ni SIRET, ni adresse ne sortent de la
 * base vers l'agent — la règle tient dans la requête, pas seulement dans le
 * résumé. Le code NAF est lu, mais seule sa division en sort.
 */
export function createSourcesPort(payload: Payload, deps: { fetch?: typeof fetch; env?: Record<string, string | undefined>; now?: () => Date } = {}): SourcesPort {
  const f = deps.fetch ?? fetch;
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());

  return {
    site: (urls) => readSite(siteFetcher(f, FETCH_TIMEOUT_MS), urls),

    async acquisition(months) {
      const [leads, clients] = await Promise.all([
        payload.find({ collection: "form-submissions", pagination: false, depth: 0, overrideAccess: true, select: { channel: true, createdAt: true } as never }),
        payload.find({
          collection: "partner-clients",
          pagination: false,
          depth: 0,
          overrideAccess: true,
          select: { formSubmission: true, clientStatus: true, source: true, collaborateurs: true, geo: { postcode: true }, createdAt: true, quoteSignedAt: true, naf: true } as never,
        }),
      ]);
      const rows = (clients.docs as (ClientIn & { geo?: { postcode?: string | null } | null })[]).map((c) => ({ ...c, postcode: c.geo?.postcode ?? null }));
      return anonymousSummary(leads.docs as LeadIn[], rows, months, now());
    },

    async competitors() {
      const r = await payload.find({ collection: "ad-competitors", where: { status: { equals: "suivi" } }, pagination: false, depth: 0, overrideAccess: true });
      return (r.docs as { pageId: string; name: string }[]).map((c) => ({ pageId: c.pageId, name: c.name }));
    },

    adLibrary: (q) => searchAdLibrary(q, { fetch: (url) => f(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }), env, now: now() }),

    async targeting(campaign, kind, query) {
      const c = (await payload.findByID({ collection: "ad-campaigns", id: campaign, depth: 0, overrideAccess: true })) as { account?: number | { id: number } | null };
      const account = typeof c.account === "object" && c.account ? c.account.id : c.account;
      if (!account) throw new AccountUnavailable("La campagne n'a pas de compte publicitaire : choisissez-le dans l'onglet « Chez la régie ».");
      const { ctx, platform } = await accountContext(payload, account, env);
      if (!platform.searchTargeting) throw new AccountUnavailable(`${platform.label} : la recherche de ciblage n'est pas branchée.`);
      return platform.searchTargeting(ctx, kind, query);
    },

    async hasPixel(campaign) {
      const c = (await payload.findByID({ collection: "ad-campaigns", id: campaign, depth: 1, overrideAccess: true })) as { account?: { diffusion?: { pixelId?: string | null } | null } | number | null };
      return typeof c.account === "object" && Boolean(c.account?.diffusion?.pixelId);
    },

    async proposeCompetitor(c) {
      const known = await payload.count({ collection: "ad-competitors", where: { pageId: { equals: c.pageId } }, overrideAccess: true });
      if (known.totalDocs) return "deja-connu";
      await payload.create({
        collection: "ad-competitors",
        data: { name: c.name, pageId: c.pageId, status: "propose", proposedBy: c.run, keywords: c.keywords, rationale: c.rationale } as never,
        overrideAccess: true,
      });
      return "propose";
    },
  };
}
