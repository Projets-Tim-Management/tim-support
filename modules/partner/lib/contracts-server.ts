import type { Payload } from "payload";

import { hasAdminRole } from "@/core/access";
import { brandColorsOf, type BrandColors } from "@/core/lib/brand";
import { renderContractPdf } from "@/modules/partner/lib/contract-pdf";
import { renderContract, type RenderedContract, type TemplateSection } from "@/modules/partner/lib/contract-render";
import {
  CONTRACT_DEFAULTS,
  CONTRACT_PARAM_KEYS,
  PARAM_DERIVED_VARS,
  VAR_GROUPS,
  buildContractVars,
  contractPriceRows,
  isoDay,
  mergeContractVars,
  paramsFromClient,
  usedVariables,
  varLabel,
  type ContractParams,
  type ContractSettings,
  type ContractVars,
} from "@/modules/partner/lib/contract-vars";

/**
 * Ce que les routes des contrats partagent : charger le modèle, l'identité de
 * l'entreprise et la fiche ; rendre un brouillon (avec ou sans modifications
 * en cours) ; produire son PDF.
 */

export type ContractDoc = {
  id: number | string;
  client?: number | string | { id: number | string };
  version?: number;
  reference?: string;
  status?: string;
  templateVersion?: number | null;
  overrides?: { key?: string | null; body?: string | null }[] | null;
  params?: ContractParams | null;
  variables?: Record<string, string | boolean> | null;
  pdf?: number | string | { id: number | string; url?: string | null } | null;
};

export const idOf = (v: unknown): number | string | null =>
  v && typeof v === "object" ? ((v as { id?: number | string }).id ?? null) : ((v as number | string) ?? null);

/** Les sections personnalisées, par clé. */
export const overridesMap = (contract: Pick<ContractDoc, "overrides">): Record<string, string> =>
  Object.fromEntries(
    (contract.overrides ?? [])
      .filter((o) => o.key && typeof o.body === "string")
      .map((o) => [o.key as string, o.body as string]),
  );

/**
 * Référence d'un contrat : `CTR-<numéro>-v<version>`. Le numéro est une
 * séquence commune à tous les contrats, qui démarre à 231220 ; une nouvelle
 * version garde le numéro de son contrat.
 */
const FIRST_CONTRACT_NUMBER = 231220;

export const contractReference = (number: number, version: number): string => `CTR-${number}-v${version}`;

/** Le numéro porté par une référence (null si elle précède la séquence). */
export const contractNumberOf = (reference: unknown): number | null => {
  const m = typeof reference === "string" ? reference.match(/^CTR-(\d+)-v\d+$/) : null;
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= FIRST_CONTRACT_NUMBER ? n : null;
};

/** Le prochain numéro libre de la séquence. */
export async function nextContractNumber(payload: Payload): Promise<number> {
  const res = await payload.find({
    collection: "client-contracts",
    limit: 0,
    pagination: false,
    depth: 0,
    select: { reference: true },
    overrideAccess: true,
  });
  const numbers = res.docs.map((d) => contractNumberOf((d as { reference?: string }).reference)).filter((n) => n != null);
  return numbers.length ? Math.max(...(numbers as number[])) + 1 : FIRST_CONTRACT_NUMBER;
}

export type ContractContext = {
  client: Record<string, unknown>;
  template: { title: string; sections: TemplateSection[]; version: number };
  /** Les variables telles que la fiche et les pages Système les donnent. */
  vars: ContractVars;
  settings: ContractSettings;
  /** Identité de TIM Management pour le PDF (Système → Apparence). */
  brand: { theme: BrandColors; logoUrl: string | null; logoMime: string | null };
};

/** Ce qu'un contrat change par rapport à la fiche. */
export type ContractInputs = {
  params?: ContractParams | null;
  variables?: Record<string, string | boolean> | null;
};

/** Ne garde que des conditions commerciales connues, aux bons types. */
function cleanParams(input: unknown): ContractParams {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: ContractParams = {};
  for (const k of CONTRACT_PARAM_KEYS) {
    const v = src[k];
    if (v === null || v === undefined || v === "") out[k] = null;
    else if (k === "integrationOffered") out[k] = v === true;
    else if (k === "contractStartDate") {
      // Un jour qui existe : « 2026-02-31 » ne revient pas identique. Une date
      // complète (« 2026-09-30T22:00:00.000Z », copiée de la fiche) → son jour à Paris.
      const day = String(v).includes("T") ? (isoDay(v) ?? "") : String(v);
      out[k] = /^\d{4}-\d{2}-\d{2}$/.test(day) && isoDay(day) === day ? day : null;
    }
    else if (k === "preferentialYears" || k === "integrationFee") {
      const n = Number(v);
      out[k] = Number.isFinite(n) && n >= 0 ? n : null;
    } else out[k] = String(v).slice(0, 200);
  }
  return out;
}

/** Ne garde que des variables connues du modèle, en texte (ou oui / non). */
function cleanVariables(input: unknown): Record<string, string | boolean> {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(src)) {
    if (!/^[\w.]+$/.test(k) || PARAM_DERIVED_VARS.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 2000);
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * Les conditions du contrat, complétées par celles de la fiche pour une clé
 * que le contrat n'a jamais enregistrée (condition ajoutée après sa création).
 */
export function contractParams(ctx: ContractContext, params: ContractParams | null | undefined): ContractParams {
  const own = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined));
  return cleanParams({ ...paramsFromClient(ctx.client), ...own });
}

/** Les variables du contrat : fiche + conditions du contrat + valeurs modifiées. */
export function contractVars(ctx: ContractContext, inputs: ContractInputs): ContractVars {
  const base = inputs.params
    ? buildContractVars({ ...ctx.client, ...contractParams(ctx, inputs.params) }, ctx.settings)
    : ctx.vars;
  return mergeContractVars(base, inputs.variables);
}

export type InfoField = {
  name: string;
  label: string;
  bool: boolean;
  /** Valeur de la fiche / des pages Système. */
  source: string | boolean | null;
  /** Valeur saisie pour ce contrat, si elle diffère. */
  value: string | boolean | null;
  overridden: boolean;
};

/** L'étape « Informations » : les variables citées par le contrat, par groupe. */
export function infoGroups(ctx: ContractContext, inputs: ContractInputs, sectionOverrides: Record<string, string>) {
  const bodies = ctx.template.sections.map((sec) => sectionOverrides[sec.key] ?? sec.body);
  const used = usedVariables(bodies);
  const source = contractVars(ctx, { params: inputs.params });
  const overrides = inputs.variables ?? {};
  const field = (name: string): InfoField => ({
    name,
    label: varLabel(name).label,
    bool: typeof source[name] === "boolean",
    source: source[name] ?? null,
    value: name in overrides ? overrides[name] : null,
    overridden: name in overrides,
  });
  const known = new Set(VAR_GROUPS.flatMap((g) => g.names));
  const groups = VAR_GROUPS.map((g) => ({
    title: g.title,
    fields: g.names.filter((n) => used.has(n) && !PARAM_DERIVED_VARS.has(n)).map(field),
  }));
  const others = [...used].filter((n) => !known.has(n) && !PARAM_DERIVED_VARS.has(n)).map(field);
  if (others.length) groups.push({ title: "Autres", fields: others });
  return groups.filter((g) => g.fields.length);
}

export async function loadContractContext(payload: Payload, clientId: number | string): Promise<ContractContext> {
  const [client, company, tpl, appearance] = await Promise.all([
    payload.findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true }),
    payload.findGlobal({ slug: "company-settings", depth: 0, overrideAccess: true }),
    payload.findGlobal({ slug: "contract-settings", depth: 0, overrideAccess: true }),
    payload.findGlobal({ slug: "appearance", depth: 1, overrideAccess: true }).catch(() => null),
  ]);
  const look = (appearance ?? {}) as unknown as Record<string, unknown>;
  const logo = look.companyLogo as { url?: string | null; mimeType?: string | null } | null | undefined;
  const c = company as unknown as Record<string, string | null | undefined>;
  const t = tpl as {
    title?: string;
    templateVersion?: number | null;
    sections?: TemplateSection[];
    defaults?: ContractSettings["defaults"];
  };
  const settings: ContractSettings = {
    provider: {
      denomination: c.denomination,
      formeSociale: c.formeSociale,
      adresse: c.adresse,
      villeRcs: c.villeRcs,
      numeroRcs: c.numeroRcs,
      representant: c.representant,
      qualite: c.qualite,
      tribunal: c.tribunal,
    },
    bank: { iban: c.iban, bic: c.bic },
    defaults: t.defaults,
  };
  const clientDoc = client as unknown as Record<string, unknown>;
  return {
    client: clientDoc,
    template: {
      title: t.title ?? "Contrat",
      version: Number(t.templateVersion ?? 0) || 0,
      sections: (t.sections ?? []).map((s) => ({
        key: s.key,
        title: s.title ?? "",
        kind: s.kind ?? "article",
        body: s.body ?? "",
      })),
    },
    vars: buildContractVars(clientDoc, settings),
    settings,
    brand: {
      theme: brandColorsOf(look),
      logoUrl: logo && typeof logo === "object" ? (logo.url ?? null) : null,
      logoMime: logo && typeof logo === "object" ? (logo.mimeType ?? null) : null,
    },
  };
}

/**
 * Le logo de la page Apparence, téléchargé pour le PDF. Échec ou format non
 * lisible (SVG…) : null — le PDF écrit alors le nom de la société.
 */
async function loadLogo(ctx: ContractContext): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  const { logoUrl, logoMime } = ctx.brand;
  const format = logoMime === "image/png" ? "png" : logoMime === "image/jpeg" ? "jpg" : null;
  if (!logoUrl || !format) return null;
  try {
    const base = process.env.NEXT_PUBLIC_SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
    const res = await fetch(new URL(logoUrl, base), { cache: "no-store" });
    if (!res.ok) return null;
    return { data: Buffer.from(await res.arrayBuffer()), format };
  } catch {
    return null;
  }
}

export function renderFromContext(
  ctx: ContractContext,
  overrides: Record<string, string>,
  vars: ContractVars = ctx.vars,
): RenderedContract {
  return renderContract(ctx.template, vars, overrides, { hasPrices: contractPriceRows(ctx.client).length > 0 });
}

/** Ce que l'éditeur envoie (brouillon non enregistré ou à enregistrer). */
export type DraftBody = {
  overrides?: Record<string, string | null>;
  params?: unknown;
  variables?: unknown;
};

/**
 * L'état d'un brouillon avec les modifications de l'éditeur par-dessus :
 * sections (`null` = revenir au modèle), conditions et informations
 * (remplacées en entier quand elles sont fournies).
 */
export function applyDraft(contract: ContractDoc, body: DraftBody | null | undefined) {
  const overrides = { ...overridesMap(contract) };
  for (const [key, value] of Object.entries(body?.overrides ?? {})) {
    if (typeof value === "string") overrides[key] = value.slice(0, 50_000);
    else delete overrides[key];
  }
  const inputs: ContractInputs = {
    params: body?.params !== undefined ? cleanParams(body.params) : (contract.params ?? null),
    variables: body?.variables !== undefined ? cleanVariables(body.variables) : (contract.variables ?? null),
  };
  return { overrides, inputs };
}

/** Les entrées d'un contrat enregistré. */
export const inputsOf = (contract: Pick<ContractDoc, "params" | "variables">): ContractInputs => ({
  params: contract.params ?? null,
  variables: contract.variables ?? null,
});

/** Les informations manquantes, avec leur libellé et l'endroit où les saisir. */
export const missingList = (rendered: RenderedContract) =>
  rendered.missing.map((name) => ({ name, ...varLabel(name) }));

export async function contractPdf(
  ctx: ContractContext,
  rendered: RenderedContract,
  reference: string,
  v: ContractVars = ctx.vars,
  /** Aperçu de travail : variables surlignées. Jamais pour l'envoi. */
  highlight = false,
): Promise<Buffer> {
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const clientName = str("client.denomination") || String(ctx.client.companyName ?? "Client");
  return renderContractPdf({
    theme: ctx.brand.theme,
    logo: await loadLogo(ctx),
    contract: rendered,
    priceRows: contractPriceRows(ctx.client),
    reference,
    highlight,
    clientName,
    providerName: str("prestataire.denomination") || CONTRACT_DEFAULTS.providerName,
    signatories: {
      provider: { company: str("prestataire.denomination") },
      client: { company: clientName },
    },
  });
}

/** Seul TIM agit sur les contrats (le partenaire lit). */
export async function requireAdmin(payload: Payload, req: Request) {
  const { user } = await payload.auth({ headers: req.headers });
  return hasAdminRole(user) ? user : null;
}
