import type { AdminViewServerProps, Where } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import Link from "next/link";

import { hasAdminRole } from "@/core/access";
import { REFUSAL_REASONS } from "@/modules/ads/lib/creative-options";
import { ctaLabel } from "@/modules/ads/lib/cta";
import { testLabel, toneLabel, type TestDimension } from "@/modules/ads/lib/dimensions";

import { CreativeCard, type CardCreative } from "./CreativeCard";

/**
 * Publicité › À valider (/admin/publicite/a-valider).
 *
 * L'écran qu'on ouvre chaque matin (plan, §8) : les créas à décider, une carte
 * chacune, avec tout ce qu'il faut voir pour trancher ; puis, dans l'onglet
 * « Validées », ce qui est prêt à partir, à télécharger par créa ou par campagne.
 */

const BASE = "/admin/publicite/a-valider";

type Raw = {
  id: number | string;
  angle: string;
  hook?: string | null;
  tone?: string | null;
  cta?: string | null;
  status?: string | null;
  tests?: { dimension: TestDimension; value: string }[] | null;
  campaign?: { id: number | string; name: string } | number | null;
  texts?: { kind: string; text: string; status: string; reason?: string | null; chars?: number | null }[] | null;
  assets?: { format: string; template?: string | null; media?: { url?: string | null } | number | null }[] | null;
  facts?: ({ statement: string; source: string } | number)[] | null;
  generation?: { costEur?: number | null } | null;
  decidedAt?: string | null;
  refusalReason?: string | null;
};

const toCard = (r: Raw): CardCreative => ({
  id: r.id,
  angle: r.angle,
  hook: r.hook ?? null,
  tone: r.tone ?? "vous",
  toneLabel: toneLabel(r.tone),
  testLabels: (r.tests ?? []).map((t) => `${testLabel(t.dimension)} (${t.value})`),
  cta: ctaLabel(r.cta) ?? "En savoir plus",
  status: r.status ?? "brouillon",
  campaign: typeof r.campaign === "object" && r.campaign ? { id: r.campaign.id, name: r.campaign.name } : null,
  texts: (r.texts ?? []).map((t) => ({ kind: t.kind, text: t.text, status: t.status, reason: t.reason ?? null, chars: t.chars ?? [...t.text].length })),
  assets: (r.assets ?? []).map((a) => ({ format: a.format, template: a.template ?? null, url: typeof a.media === "object" && a.media ? (a.media.url ?? null) : null })),
  facts: (r.facts ?? []).filter((f): f is { statement: string; source: string } => typeof f === "object" && f !== null),
  costEur: r.generation?.costEur ?? null,
  decidedAt: r.decidedAt ?? null,
  refusal: REFUSAL_REASONS.find((x) => x.value === r.refusalReason)?.label ?? null,
});

export default async function ValidationQueueView(view: AdminViewServerProps) {
  const { initPageResult, params, searchParams } = view;
  const { req } = initPageResult;
  const { payload, user } = req;
  const sp = (await searchParams) ?? {};
  const tab = sp.vue === "validees" ? "validees" : "a-valider";
  const campaignFilter = typeof sp.campagne === "string" && sp.campagne ? sp.campagne : null;

  let body: React.ReactNode = <p className="an-empty">Cet écran est réservé aux administrateurs.</p>;
  if (hasAdminRole(user)) {
    const status = tab === "validees" ? "validee" : "a-valider";
    const where: Where = { and: [{ status: { equals: status } }, ...(campaignFilter ? [{ campaign: { equals: campaignFilter } }] : [])] };
    const [list, counts, campaigns] = await Promise.all([
      payload.find({ collection: "ad-creatives", where, sort: tab === "validees" ? "-decidedAt" : "createdAt", pagination: false, depth: 2, overrideAccess: true }),
      Promise.all(["a-valider", "validee"].map((s) => payload.count({ collection: "ad-creatives", where: { status: { equals: s } }, overrideAccess: true }))),
      payload.find({ collection: "ad-campaigns", pagination: false, depth: 0, overrideAccess: true, select: { name: true } as never }),
    ]);
    const cards = (list.docs as unknown as Raw[]).map(toCard);
    const href = (t: string, c: string | null) => `${BASE}?vue=${t}${c ? `&campagne=${c}` : ""}`;
    const byCampaign = new Map<string, CardCreative[]>();
    for (const c of cards) {
      const k = String(c.campaign?.id ?? "");
      if (!byCampaign.has(k)) byCampaign.set(k, []);
      byCampaign.get(k)!.push(c);
    }

    body = (
      <>
        <div className="ads-dash__filters">
          <nav className="an-filters" aria-label="File">
            <Link href={href("a-valider", campaignFilter)} prefetch={false} className={`an-filter${tab === "a-valider" ? " an-filter--on" : ""}`}>
              À valider ({counts[0].totalDocs})
            </Link>
            <Link href={href("validees", campaignFilter)} prefetch={false} className={`an-filter${tab === "validees" ? " an-filter--on" : ""}`}>
              Validées ({counts[1].totalDocs})
            </Link>
          </nav>
          {campaigns.docs.length > 1 && (
            <nav className="an-filters" aria-label="Campagne">
              <Link href={href(tab, null)} prefetch={false} className={`an-filter${!campaignFilter ? " an-filter--on" : ""}`}>
                Toutes les campagnes
              </Link>
              {(campaigns.docs as { id: number | string; name: string }[]).map((c) => (
                <Link key={c.id} href={href(tab, String(c.id))} prefetch={false} className={`an-filter${campaignFilter === String(c.id) ? " an-filter--on" : ""}`}>
                  {c.name}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {cards.length === 0 ? (
          <p className="ads-queue__empty">
            {tab === "a-valider" ? (
              <>
                Rien à valider. Les créas arrivent ici quand on les génère depuis le brief d&apos;une{" "}
                <Link href="/admin/collections/ad-campaigns" prefetch={false}>
                  campagne
                </Link>
                .
              </>
            ) : (
              "Aucune créa validée pour l'instant."
            )}
          </p>
        ) : tab === "validees" ? (
          [...byCampaign.entries()].map(([id, group]) => (
            <section key={id} className="ads-queue__group">
              <header className="ads-queue__group-head">
                <h2>{group[0].campaign?.name ?? "Sans campagne"}</h2>
                {id && (
                  <a className="tim-btn tim-btn--primary" href={`/api/admin/ads/campaigns/${id}/download`}>
                    Télécharger la campagne (ZIP)
                  </a>
                )}
              </header>
              {group.map((c) => (
                <CreativeCard key={String(c.id)} c={c} />
              ))}
            </section>
          ))
        ) : (
          cards.map((c) => <CreativeCard key={String(c.id)} c={c} />)
        )}
      </>
    );
  }

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <div className="an ads-dash">
          <header className="an-head">
            <h1 className="an-title">À valider</h1>
            <p className="ads-dash__sub">Chaque créa se valide ou se refuse ici. Validée, elle se télécharge aux formats Meta.</p>
          </header>
          {body}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
