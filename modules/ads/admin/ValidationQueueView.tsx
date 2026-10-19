import type { AdminViewServerProps, Where } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import Link from "next/link";

import { hasAdminRole } from "@/core/access";
import { pendingProposals, type AgentProposal } from "@/modules/ads/agent/overview";
import { missingFiles, type CreativeFile } from "@/modules/ads/lib/creative-files";
import { REFUSAL_REASONS } from "@/modules/ads/lib/creative-options";
import { ctaLabel } from "@/modules/ads/lib/cta";
import { expectedFileNames } from "@/modules/ads/lib/design-brief/prompt";
import { testLabel, toneLabel, type TestDimension } from "@/modules/ads/lib/dimensions";
import type { FormatKey } from "@/modules/ads/lib/meta-specs";

import { CreativeCard, type CardCreative, type Attachment } from "./CreativeCard";
import { NotebookProposals, type ProposedInstruction, type ProposedLearning } from "./NotebookProposals";

/**
 * Publicité › À valider (/admin/publicite/a-valider).
 *
 * L'écran qu'on ouvre chaque matin (plan, §8) : les créas à décider, une carte
 * chacune — ses textes, son brief Claude Design (le prompt à copier, les
 * fichiers à joindre) et l'import des fichiers finis ; puis, dans l'onglet
 * « Validées », ce qui est prêt à partir, à télécharger par créa ou par campagne.
 *
 * En tête de l'onglet « À valider » : les consignes nées des refus et les
 * apprentissages à étendre, que l'agent ne lira qu'une fois confirmés.
 */

const BASE = "/admin/publicite/a-valider";
/** « Validées » grossit sans fin : on n'en montre que les plus récentes (les ZIP par campagne, eux, prennent tout). */
const VALIDATED_LIMIT = 60;

type Raw = {
  id: number | string;
  angle: string;
  requestedAngle?: string | null;
  hook?: string | null;
  tone?: string | null;
  cta?: string | null;
  status?: string | null;
  tests?: { dimension: TestDimension; value: string }[] | null;
  campaign?: { id: number | string; name: string } | number | null;
  copy?: { kind: string; text: string; status: string; reason?: string | null; chars?: number | null }[] | null;
  brief?: {
    kind?: string | null;
    formats?: string[] | null;
    durationSec?: number | null;
    rationale?: string | null;
    prompt?: string | null;
    rushes?: ({ id: number; title?: string | null; original?: { url?: string | null; filename?: string | null } | null } | number)[] | null;
  } | null;
  files?: CreativeFile[] | null;
  facts?: ({ statement: string; source: string } | number)[] | null;
  generation?: { costEur?: number | null } | null;
  decidedAt?: string | null;
  refusalReason?: string | null;
};

type Named = { id: number | string; name: string } | number | null | undefined;
const named = (v: Named) => (typeof v === "object" && v ? { id: v.id, name: v.name } : null);

const toInstruction = (r: { id: number | string; text: string; refusalReason?: string | null; campaign?: Named; sourceCreative?: { angle?: string | null } | number | null }): ProposedInstruction => ({
  id: r.id,
  text: r.text,
  refusal: r.refusalReason ?? null,
  creativeAngle: typeof r.sourceCreative === "object" && r.sourceCreative ? (r.sourceCreative.angle ?? null) : null,
  campaign: named(r.campaign),
});

const toLearning = (r: { id: number | string; statement: string; confidence?: string | null; campaign?: Named }): ProposedLearning => ({
  id: r.id,
  statement: r.statement,
  confidence: r.confidence ?? null,
  campaign: named(r.campaign),
});

/** Ce que l'agent propose pour la campagne, avant ses créas : on juge les créas à la lumière du plan. */
function ProposalCard({ p }: { p: AgentProposal }) {
  const rows: [string, string | null][] = [
    ["Positionnement", p.positionnement],
    ["Audiences", p.audience],
    ["Répartition du budget", p.repartition],
  ];
  return (
    <article className="ads-card ads-card--proposal">
      <header className="ads-card__head">
        <div>
          <h3 className="ads-card__angle">Proposition de l&apos;agent — {p.campagne.nom}</h3>
          <p className="ads-card__origin">
            {p.creasAValider} créa{p.creasAValider > 1 ? "s" : ""} de ce passage à décider ci-dessous. Rien n&apos;est envoyé à Meta.
          </p>
        </div>
      </header>
      <dl className="ads-proposal-card__rows">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v ?? <span className="ads-proposal-card__none">pas de proposition</span>}</dd>
          </div>
        ))}
      </dl>
      {p.bilan && <p className="ads-proposal-card__summary">{p.bilan}</p>}
      <footer className="ads-card__actions">
        <Link href={`/admin/collections/ad-campaigns/${p.campagne.id}`} prefetch={false} className="tim-btn">
          Voir le passage (onglet « Agent »)
        </Link>
      </footer>
    </article>
  );
}

const toCard = (r: Raw): CardCreative => ({
  id: r.id,
  angle: r.angle,
  requestedAngle: r.requestedAngle ?? null,
  hook: r.hook ?? null,
  tone: r.tone ?? "vous",
  toneLabel: toneLabel(r.tone),
  testLabels: (r.tests ?? []).map((t) => `${testLabel(t.dimension)} (${t.value})`),
  cta: ctaLabel(r.cta) ?? "En savoir plus",
  status: r.status ?? "brouillon",
  campaign: typeof r.campaign === "object" && r.campaign ? { id: r.campaign.id, name: r.campaign.name } : null,
  texts: (r.copy ?? []).map((t) => ({ kind: t.kind, text: t.text, status: t.status, reason: t.reason ?? null, chars: t.chars ?? [...t.text].length })),
  brief: r.brief?.prompt
    ? {
        kind: r.brief.kind ?? "video",
        formats: r.brief.formats ?? [],
        durationSec: r.brief.durationSec ?? null,
        rationale: r.brief.rationale ?? null,
        prompt: r.brief.prompt,
        rushes: (r.brief.rushes ?? [])
          .filter((x): x is Exclude<typeof x, number> => typeof x === "object" && x !== null)
          .map((x) => ({ name: x.title ?? `Rush ${x.id}`, url: x.original?.url ?? null, filename: x.original?.filename ?? null })),
        expectedFiles: expectedFileNames(r.id, { kind: (r.brief.kind ?? "video") as "video", formats: (r.brief.formats ?? []) as FormatKey[] }),
      }
    : null,
  files: (r.files ?? []).map((f) => ({ format: f.format, kind: f.kind, url: f.url, filename: f.filename ?? null, warnings: Array.isArray(f.warnings) ? f.warnings : [] })),
  missing: r.brief?.prompt ? missingFiles(r) : [],
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
    const [list, counts, campaigns, proposedInstructions, proposedLearnings, proposals, kit] = await Promise.all([
      // Profondeur 1 : campagne, faits et rushes du brief — tout ce que la carte lit.
      tab === "validees"
        ? payload.find({ collection: "ad-creatives", where, sort: "-decidedAt", limit: VALIDATED_LIMIT, depth: 1, overrideAccess: true })
        : payload.find({ collection: "ad-creatives", where, sort: "createdAt", pagination: false, depth: 1, overrideAccess: true }),
      Promise.all(["a-valider", "validee"].map((s) => payload.count({ collection: "ad-creatives", where: { status: { equals: s } }, overrideAccess: true }))),
      payload.find({ collection: "ad-campaigns", pagination: false, depth: 0, overrideAccess: true, select: { name: true } as never }),
      payload.find({ collection: "ad-instructions", where: { status: { equals: "proposee" } }, sort: "createdAt", pagination: false, depth: 1, overrideAccess: true }),
      payload.find({ collection: "ad-learnings", where: { status: { equals: "global-propose" } }, sort: "createdAt", pagination: false, depth: 1, overrideAccess: true }),
      tab === "a-valider" ? pendingProposals(payload, campaignFilter) : Promise.resolve([]),
      // Les logos du kit : à joindre à chaque brief, avec les rushes.
      payload.findGlobal({ slug: "ads-brand-kit", depth: 1, overrideAccess: true }) as unknown as Promise<Record<string, { url?: string | null; filename?: string | null } | number | null>>,
    ]);
    const logos: Attachment[] = (["logoOnLight", "logoOnDark", "logoSymbol"] as const)
      .map((k) => kit[k])
      .filter((m): m is { url?: string | null; filename?: string | null } => typeof m === "object" && m !== null && Boolean(m.url))
      .map((m) => ({ name: m.filename ?? "Logo", url: m.url ?? null, filename: m.filename ?? null }));
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
        {tab === "a-valider" && (
          <NotebookProposals instructions={(proposedInstructions.docs as never[]).map(toInstruction)} learnings={(proposedLearnings.docs as never[]).map(toLearning)} />
        )}
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
                Rien à valider. Les créas arrivent ici quand l&apos;agent d&apos;une{" "}
                <Link href="/admin/collections/ad-campaigns" prefetch={false}>
                  campagne
                </Link>{" "}
                les dépose, avec leur brief Claude Design.
              </>
            ) : (
              "Aucune créa validée pour l'instant."
            )}
          </p>
        ) : tab === "validees" ? (
          <>
            {list.totalDocs > cards.length && (
              <p className="ads-queue__limit">
                Les {VALIDATED_LIMIT} plus récentes sur {list.totalDocs}.
              </p>
            )}
            {[...byCampaign.entries()].map(([id, group]) => (
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
                  <CreativeCard key={String(c.id)} c={c} logos={logos} />
                ))}
              </section>
            ))}
          </>
        ) : (
          <>
            {proposals.map((p) => (
              <ProposalCard key={String(p.run)} p={p} />
            ))}
            {cards.map((c) => (
              <CreativeCard key={String(c.id)} c={c} logos={logos} />
            ))}
          </>
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
            <p className="ads-dash__sub">Copiez le brief dans Claude Design, importez les fichiers finis, puis validez ou refusez. Validée, la créa se télécharge aux formats Meta.</p>
          </header>
          {body}
        </div>
      </Gutter>
    </DefaultTemplate>
  );
}
