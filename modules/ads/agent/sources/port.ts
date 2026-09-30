import type { Payload } from "payload";

import { anonymousSummary, type ClientIn, type LeadIn } from "@/modules/ads/agent/sources/acquisition";
import { searchAdLibrary } from "@/modules/ads/agent/sources/ad-library";
import { readSite } from "@/modules/ads/agent/sources/site";
import type { SourcesPort } from "@/modules/ads/agent/types";

/**
 * Le port des sources du stratège, branché sur la base et sur le réseau.
 *
 * Les fiches clients ne sont lues QUE par les champs dont les agrégats ont
 * besoin (`select`) : ni nom, ni SIREN, ni adresse ne sortent de la base vers
 * l'agent — la règle tient dans la requête, pas seulement dans le résumé.
 */
export function createSourcesPort(payload: Payload, deps: { fetch?: typeof fetch; env?: Record<string, string | undefined>; now?: () => Date } = {}): SourcesPort {
  const f = deps.fetch ?? fetch;
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());

  return {
    site: (urls) => readSite((url) => f(url, { redirect: "follow", headers: { "user-agent": "TIM-support (agent de campagne)" } }), urls),

    async acquisition(months) {
      const [leads, clients] = await Promise.all([
        payload.find({ collection: "form-submissions", pagination: false, depth: 0, overrideAccess: true, select: { channel: true, createdAt: true } as never }),
        payload.find({
          collection: "partner-clients",
          pagination: false,
          depth: 0,
          overrideAccess: true,
          select: { formSubmission: true, clientStatus: true, source: true, collaborateurs: true, geo: { postcode: true }, createdAt: true, quoteSignedAt: true } as never,
        }),
      ]);
      const rows = (clients.docs as (ClientIn & { geo?: { postcode?: string | null } | null })[]).map((c) => ({ ...c, postcode: c.geo?.postcode ?? null }));
      return anonymousSummary(leads.docs as LeadIn[], rows, months, now());
    },

    async competitors() {
      const r = await payload.find({ collection: "ad-competitors", where: { status: { equals: "suivi" } }, pagination: false, depth: 0, overrideAccess: true });
      return (r.docs as { pageId: string; name: string }[]).map((c) => ({ pageId: c.pageId, name: c.name }));
    },

    adLibrary: (q) => searchAdLibrary(q, { fetch: (url) => f(url), env, now: now() }),

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
