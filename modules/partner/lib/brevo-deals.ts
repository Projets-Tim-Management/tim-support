/**
 * Import des leads du site vitrine, depuis le CRM Brevo vers les Opportunités.
 *
 * Les formulaires du site créent une « opportunité » (deal) dans le pipeline
 * Brevo « Prospect ». Ces leads restaient invisibles côté TIM : ce module les
 * fait entrer dans le Kanban, dans LEUR colonne, rattachés au partenaire du
 * site vitrine.
 *
 * Trois principes :
 *  - LECTURE SEULE côté Brevo. On n'y écrit rien.
 *  - Brevo alimente à l'ENTRÉE, TIM est maître ensuite. Un lead déjà importé
 *    n'est plus jamais retouché : sinon un déplacement de carte dans le Kanban
 *    serait écrasé au prochain cron, et une affaire passée « En phase de test »
 *    dans Brevo forcerait ici un statut que le serveur refuse sans calendrier
 *    de test (requireTestSchedule).
 *  - Seules les étapes AMONT sont importées (voir IMPORTED_STAGES) : la phase de
 *    test, les affaires gagnées et perdues sont déjà suivies dans TIM.
 *
 * Clé anti-doublon : `brevoDealId` sur la fiche. À défaut, l'adresse e-mail
 * rattrape une fiche déjà saisie à la main (on lui pose l'identifiant Brevo,
 * sans rien modifier d'autre).
 */

const CRM = "https://api.brevo.com/v3";

/**
 * Étapes Brevo importées → statut de l'opportunité TIM, PAR NOM.
 *
 * Par nom et non par identifiant : les identifiants d'étapes ne survivent pas à
 * une étape recréée, alors que le nom est ce que l'équipe voit et manipule. Une
 * étape renommée côté Brevo n'est plus reconnue — le lead est alors ignoré et
 * COMPTÉ comme tel dans le résumé du cron, plutôt que rangé au mauvais endroit.
 */
export const IMPORTED_STAGES: Record<string, string> = {
  "nouvelle": "nouvelle",
  "en qualification": "en-qualification",
  "demo programmee": "demo-programmee",
  "en attente d'engagement": "attente-engagement",
  "en attente longue": "attente-longue",
};

/** Normalise un nom d'étape : casse, accents et apostrophes typographiques. */
export const normalizeStage = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/[\u2019']/g, "'") // apostrophe typographique
    .trim()
    .toLowerCase();

/** Statut TIM d'une étape Brevo, ou `null` si elle n'est pas importée. */
export const statusForStage = (stageName?: string): string | null =>
  stageName ? (IMPORTED_STAGES[normalizeStage(stageName)] ?? null) : null;

export interface BrevoDeal {
  id: string;
  attributes?: {
    deal_name?: string;
    deal_stage?: string;
    created_at?: string;
    pipeline?: string;
  };
  linkedContactsIds?: number[];
  linkedCompaniesIds?: string[];
}

interface BrevoContact {
  email?: string;
  attributes?: Record<string, unknown>;
}

interface BrevoCompany {
  attributes?: { name?: string; domain?: string; website?: string };
}

const key = () => process.env.BREVO_API_KEY;

/**
 * Appel à l'API Brevo. LÈVE en cas d'échec — volontairement.
 *
 * Renvoyer `null` faisait passer une clé expirée ou un throttling (429) pour
 * une absence de données : l'import nocturne se terminait « ok », zéro lead
 * créé, HTTP 200. Une panne silencieuse est pire qu'une panne : personne ne la
 * cherche. L'appelant (`syncBrevoLeads`) l'attrape et la remonte dans le résumé.
 */
async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const apiKey = key();
  if (!apiKey) throw new Error("Clé API Brevo non configurée.");
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  const res = await fetch(`${CRM}${path}${qs}`, {
    headers: { "api-key": apiKey, accept: "application/json" },
    // Un import doit voir l'état courant : jamais de cache.
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status} sur ${path}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as T;
}

/** Identifiant d'étape → nom, pour tout le pipeline du compte. */
export async function fetchStageNames(): Promise<Map<string, string>> {
  const pipelines = await get<{ stages?: { id: string; name: string }[] }[]>(
    "/crm/pipeline/details/all",
  );
  const map = new Map<string, string>();
  for (const p of pipelines ?? []) {
    for (const st of p.stages ?? []) map.set(st.id, st.name);
  }
  return map;
}

/**
 * Opportunités modifiées depuis `since` (ISO), page par page.
 *
 * `modifiedSince` et non `createdSince` : un lead créé pendant une panne du cron
 * mais retouché depuis reste rattrapé. Les doublons que cela produit ne coûtent
 * rien — `brevoDealId` les écarte.
 */
export async function fetchDeals(since?: string, max = 500): Promise<BrevoDeal[]> {
  const out: BrevoDeal[] = [];
  const PAGE = 50;
  for (let offset = 0; offset < max; offset += PAGE) {
    const params: Record<string, string> = { limit: String(PAGE), offset: String(offset) };
    if (since) params.modifiedSince = since;
    const page = await get<{ items?: BrevoDeal[]; pager?: { total?: number } }>("/crm/deals", params);
    const items = page?.items ?? [];
    out.push(...items);
    // Une page pleine = il y en a peut-être d'autres. Une page incomplète marque
    // la fin — et une page en ERREUR ne passe plus par ici : `get` lève, donc
    // l'import s'arrête en le disant au lieu de tronquer silencieusement.
    if (items.length < PAGE) break;
  }
  return out;
}

/**
 * Contact et société liés à une opportunité.
 *
 * Ceux-là tolèrent l'échec : un contact supprimé chez Brevo ne doit pas faire
 * échouer l'import des 40 autres leads. On perd un nom, pas la soirée.
 */
export const fetchContact = (id: number) =>
  get<BrevoContact>(`/contacts/${id}`).catch(() => null);
export const fetchCompany = (id: string) =>
  get<BrevoCompany>(`/companies/${id}`).catch(() => null);

/** `"33620311882"` → `"+33 6 20 31 18 82"` (le champ attend un format lisible). */
export function formatPhone(raw?: unknown): string | undefined {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 6) return undefined;
  const national = digits.startsWith("33") ? digits.slice(2) : digits.replace(/^0/, "");
  if (national.length !== 9) return `+${digits}`;
  const [head, ...rest] = [national.slice(0, 1), ...(national.slice(1).match(/.{1,2}/g) ?? [])];
  return `+33 ${head} ${rest.join(" ")}`;
}

/** Nom d'entreprise de repli quand Brevo n'a pas de société liée. */
export function fallbackCompanyName(
  contact: BrevoContact | null,
  deal: BrevoDeal,
): string | undefined {
  const attrs = contact?.attributes ?? {};
  const jobTitle = typeof attrs.JOB_TITLE === "string" ? attrs.JOB_TITLE.trim() : "";
  if (jobTitle) return jobTitle;
  // `deal_name` vaut souvent « Contact_WP pibled@instalclim.fr » : le domaine de
  // l'adresse reste le meilleur indice d'entreprise. Les adresses grand public
  // n'en donnent aucun — on préfère alors le nom du contact au nom du webmail.
  const email = contact?.email ?? "";
  const domain = email.split("@")[1] ?? "";
  const PUBLIC = ["gmail.com", "orange.fr", "wanadoo.fr", "hotmail.fr", "hotmail.com", "outlook.fr", "outlook.com", "yahoo.fr", "free.fr", "sfr.fr", "laposte.net", "icloud.com", "live.fr"];
  if (domain && !PUBLIC.includes(domain.toLowerCase())) {
    const label = domain.split(".")[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const nom = typeof attrs.NOM === "string" ? attrs.NOM.trim() : "";
  return nom || deal.attributes?.deal_name?.trim() || undefined;
}

/** « Pierre Ibled » → prénom + nom (le dernier mot fait le nom de famille). */
export function splitName(full?: unknown): { firstName?: string; lastName?: string } {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export interface BrevoLead {
  dealId: string;
  clientStatus: string;
  companyName: string;
  email?: string;
  phone?: string;
  contactName: { firstName?: string; lastName?: string };
  /** Besoins cochés dans le formulaire — repris en remarque sur la fiche. */
  besoins: string[];
  createdAt?: string;
}

/**
 * Compose le lead à créer à partir d'une opportunité Brevo et de ses liens.
 * `null` = étape non importée (ou introuvable) : la raison est renvoyée à part
 * pour que le cron puisse la compter.
 */
export function buildLead(
  deal: BrevoDeal,
  stageName: string | undefined,
  contact: BrevoContact | null,
  company: BrevoCompany | null,
): { lead: BrevoLead } | { skip: string } {
  if (!stageName) return { skip: "etape_inconnue" };
  const clientStatus = IMPORTED_STAGES[normalizeStage(stageName)];
  if (!clientStatus) return { skip: `etape:${stageName}` };

  const companyName = company?.attributes?.name?.trim() || fallbackCompanyName(contact, deal);
  if (!companyName) return { skip: "sans_entreprise" };

  const attrs = contact?.attributes ?? {};
  const besoins = Array.isArray(attrs.BESOINS) ? (attrs.BESOINS as unknown[]).map(String) : [];

  return {
    lead: {
      dealId: deal.id,
      clientStatus,
      companyName,
      email: contact?.email?.trim().toLowerCase(),
      phone: formatPhone(attrs.SMS),
      contactName: splitName(attrs.NOM),
      besoins,
      createdAt: deal.attributes?.created_at,
    },
  };
}
