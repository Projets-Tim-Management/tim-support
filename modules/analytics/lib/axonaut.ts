import type { ProfilKey } from "@/modules/partner/lib/pricing";

/**
 * L'historique de facturation d'avant Pennylane : les factures Axonaut de TIM,
 * de septembre 2021 (la première) à septembre 2026 (Pennylane facture seul
 * depuis octobre 2026).
 *
 * Le compte Axonaut a d'abord servi à DELIGUME (paniers de fruits et légumes,
 * 2019–2020) : ces factures ne sont pas du CA de TIM et ne s'importent jamais
 * (isTimInvoice).
 *
 * Axonaut n'exporte que des PDF, un par facture. On les lit tels que
 * `pdftotext -layout` les rend : la mise en page est la même partout (numéro,
 * date, bloc client à droite, une ligne par profil de licence, totaux). Tout
 * est pur ici ; l'import (scripts/import-axonaut.ts) lit les fichiers et écrit.
 *
 * Deux montants par facture, en plus du total comptable :
 *  - le RÉCURRENT : les licences, ce qui revient chaque mois ;
 *  - les PRESTATIONS : mise en place, formation, développements — ponctuelles.
 * Une facture qui ne porte que des licences est tout entière récurrente, ses
 * ajustements globaux compris (« Régulariser la situation »).
 */

/** Dernier mois facturé par Axonaut ; Pennylane prend la suite au mois suivant. */
export const AXONAUT_LAST_MONTH = "2026-09";

export type AxonautLine = {
  label: string;
  /** Le profil de licence reconnu, ou null (prestation, licence sans profil). */
  profile: ProfilKey | null;
  licence: boolean;
  unitPrice: number;
  qty: number;
  /** La remise telle qu'imprimée (« -20,00 % », « -8,00 € »), ou null. */
  discount: string | null;
  amountHT: number;
};

export type AxonautDoc = {
  kind: "facture" | "avoir";
  number: string;
  /** ISO jour. */
  date: string;
  /** « AAAA-MM ». */
  month: string;
  clientName: string;
  siren: string | null;
  vatNumber: string | null;
  totalHT: number;
  totalTTC: number;
  /** Pour un avoir : la facture qu'il corrige. */
  creditFor: string | null;
  lines: AxonautLine[];
  recurringHT: number;
  servicesHT: number;
  /** Pourquoi le récurrent ou les prestations ne suivent pas les lignes (régularisation). */
  note: string | null;
};

const amount = (s: string): number => Number(s.replace(/[\s  €]/g, "").replace(",", "."));
const round2 = (n: number) => Math.round(n * 100) / 100;

const PROFILE_WORDS: [RegExp, ProfilKey][] = [
  [/ADMINISTRATION/i, "admin"],
  [/CONDUCTEUR/i, "conducteur"],
  [/CHEF D(?:E|')\s*CHANTIER/i, "chefChantier"],
  [/CHEF D(?:E|')\s*[EÉ]QUIPE/i, "chefEquipe"],
  [/COMPAGNON/i, "compagnon"],
];

export const profileOf = (label: string): ProfilKey | null => PROFILE_WORDS.find(([re]) => re.test(label))?.[1] ?? null;

// « Libellé   41,00 €   22   -25,00 %   676,50 € » — la remise est facultative.
const LINE = /^\s*(\S.*?)\s{2,}(-?[\d\s ]+,\d\d) €\s+(-?\d+)\s+(?:(-?[\d\s]+,\d\d ?[€%])\s+)?(-?[\d\s ]+,\d\d) €/;

/** SIREN de TIM Management (LC DEV) et de DELIGUME, tels qu'ils apparaissent sur les PDF. */
const TIM_SIREN = /892\s?316\s?035/;
const DELIGUME = /831\s?150\s?305|deligume|delibox|delifruit|delipanier/i;

/**
 * Une facture de TIM, et seulement de TIM : émise sous son SIREN, et sans
 * produit DELIGUME. Cinq factures d'avril 2022, saisies sur le compte TIM,
 * vendent encore des paniers DELIGUME (ramenés à 0 €) : elles sont écartées
 * aussi (décision de Charlie, 31/10/2026 : « rien de DELIGUME »). Pure.
 */
export function isTimInvoice(text: string): boolean {
  return TIM_SIREN.test(text) && !DELIGUME.test(text);
}

/**
 * Une facture ou un avoir Axonaut, depuis le texte de `pdftotext -layout`.
 * Lève une erreur si l'essentiel (numéro, date, totaux) est introuvable.
 */
export function parseAxonaut(text: string): AxonautDoc {
  const head = text.match(/TIM MANAGEMENT - LC DEV - (Facture|Avoir) (F\d{8}-\d+)/);
  const day = text.match(/LUCENAY, le (\d\d)\/(\d\d)\/(\d{4})/);
  const ht = text.match(/Total HT\s+(-?[\d\s ]+,\d\d) €/);
  const ttc = text.match(/Total TTC\s+(-?[\d\s ]+,\d\d) €/);
  if (!head || !day || !ht || !ttc) throw new Error("Ce n'est pas une facture Axonaut lisible (numéro, date ou totaux absents).");

  const rows = text.split("\n");
  // Le bloc client : la colonne de droite, entre la date et l'en-tête du tableau.
  const from = rows.findIndex((l) => l.includes("LUCENAY, le"));
  const to = rows.findIndex((l, i) => i > from && /^\s*Description\s/.test(l));
  const block = rows
    .slice(from + 1, to === -1 ? undefined : to)
    .map((l) => (l.length > 60 ? l.slice(60).trim() : ""))
    .filter(Boolean);
  let clientName = block[0] ?? "";
  // Un nom long continue sur la ligne suivante (« … ET » / « L'HABITAT (E.T.B.H) »).
  if (/\bET$/.test(clientName) && block[1] && !/:/.test(block[1])) clientName = `${clientName} ${block[1]}`;
  const blockText = block.join(" ");
  const vatNumber = blockText.match(/TVA\s*:\s*([A-Z]{2}[\dA-Z]+)/)?.[1] ?? null;
  const reg = blockText.match(/(?:Siret|SIRET|SIREN)\s*:\s*([\d ]{9,17})/)?.[1];
  // Un SIRET commence par le SIREN ; à défaut, la TVA française le porte en fin.
  const siren = reg ? reg.replace(/\D/g, "").slice(0, 9) : vatNumber?.startsWith("FR") ? vatNumber.slice(-9) : null;

  const lines: AxonautLine[] = [];
  for (const l of rows) {
    if (/^\s*(Total|TVA|Sous total)/.test(l)) continue;
    const m = l.match(LINE);
    if (!m) continue;
    const label = m[1].replace(/\s+/g, " ").trim();
    const licence = /^Licences\b/i.test(label);
    lines.push({
      label,
      profile: licence ? profileOf(label) : null,
      licence,
      unitPrice: amount(m[2]),
      qty: Number(m[3]),
      discount: m[4]?.trim() || null,
      amountHT: amount(m[5]),
    });
  }

  const totalHT = amount(ht[1]);
  const licencesHT = round2(lines.filter((l) => l.licence).reduce((s, l) => s + l.amountHT, 0));
  const onlyLicences = lines.length > 0 && lines.every((l) => l.licence);
  const recurringHT = onlyLicences ? totalHT : Math.min(licencesHT, totalHT);
  const date = `${day[3]}-${day[2]}-${day[1]}`;

  return {
    kind: head[1] === "Avoir" ? "avoir" : "facture",
    number: head[2],
    date,
    month: date.slice(0, 7),
    clientName,
    siren,
    vatNumber,
    totalHT,
    totalTTC: amount(ttc[1]),
    creditFor: text.match(/Avoir sur facture : #(F\d{8}-\d+)/)?.[1] ?? null,
    lines,
    recurringHT: round2(recurringHT),
    servicesHT: round2(totalHT - recurringHT),
    note: null,
  };
}

/**
 * Les corrections connues, appliquées après la lecture.
 *
 * Pro11 (Groupe Viriate Services) a été surfacturé (1 113 €, puis 1 308,75 €
 * par mois) ; le vrai montant était 419,40 €. Régularisé le 24/07/2025 :
 * treize avoirs (n° 151 à 163, dont seul le 154 figure dans l'export) et une
 * facture de 5 652,20 € qui refacture au bon prix les treize factures qu'elle
 * cite — juin 2024, août 2024, septembre 2024 à juillet 2025 (juillet 2024 n'y
 * est pas : il reste tel que facturé). On compte donc 419,40 € pour chacune, et
 * la régularisation à zéro — sinon 2024 et 2025 paraissent gonflés (décision de
 * Charlie, 30/10/2026). Le total comptable, lui, reste celui du PDF.
 */
const PRO11_MONTHS = [
  "F20240603-126",
  "F20240803-139",
  "F20240903-145",
  "F20241003-151",
  "F20241103-157",
  "F20241203-163",
  "F20250103-102",
  "F20250203-110",
  "F20250303-117",
  "F20250403-124",
  "F20250503-131",
  "F20250603-138",
  "F20250703-145",
];
/**
 * Les prestations d'une facture, en deux familles : la mise en place et la
 * formation (« Mise en place / Formation », « Mise en place »), et les
 * développements sur mesure (tout le reste : « Développement sur mesure »,
 * « Ventilation des heures »…). Réparties au prorata des lignes, pour que la
 * remise de la facture pèse sur chacune ; une facture sans ligne lisible
 * range tout en développements.
 */
export function splitServices(lines: Pick<AxonautLine, "label" | "licence" | "amountHT">[], servicesHT: number): { setupHT: number; devHT: number } {
  const others = lines.filter((l) => !l.licence);
  const gross = others.reduce((s, l) => s + l.amountHT, 0);
  if (!servicesHT || !gross) return { setupHT: 0, devHT: round2(servicesHT) };
  const setupGross = others.filter((l) => /mise en place|formation/i.test(l.label)).reduce((s, l) => s + l.amountHT, 0);
  const setupHT = round2((servicesHT * setupGross) / gross);
  return { setupHT, devHT: round2(servicesHT - setupHT) };
}

/**
 * CTSM est facturé le 29 pour le mois suivant (la facture du 29/05 couvre
 * juin) ; tous les autres clients le sont en début de mois pour le mois en
 * cours. Ses factures comptent donc pour le mois d'après : juin à septembre
 * 2026, puis octobre chez Pennylane, sans trou.
 */
const CTSM_NEXT_MONTH: Record<string, string> = {
  "F20260529-144": "2026-06",
  "F20260629-158": "2026-07",
  "F20260729-172": "2026-08",
  "F20260829-188": "2026-09",
};

export const AXONAUT_CORRECTIONS: Record<string, { recurringHT?: number; servicesHT?: number; month?: string; note: string }> = {
  ...Object.fromEntries(
    PRO11_MONTHS.map((n) => [n, { recurringHT: 419.4, servicesHT: 0, note: "Facturé 1 308,75 € par erreur ; régularisé à 419,40 € le 24/07/2025." }]),
  ),
  "F20250724-154": { recurringHT: 0, servicesHT: 0, note: "Avoir de la régularisation Pro11 : le mois réel est déjà compté à 419,40 €." },
  "F20250724-164": { recurringHT: 0, servicesHT: 0, note: "Régularisation Pro11 (13 factures de juin 2024 à juillet 2025 au bon prix) : chaque mois réel est déjà compté." },
  ...Object.fromEntries(Object.entries(CTSM_NEXT_MONTH).map(([n, month]) => [n, { month, note: "Facturée le 29 pour le mois suivant." }])),
};

export function withCorrections(doc: AxonautDoc): AxonautDoc {
  const fix = AXONAUT_CORRECTIONS[doc.number];
  return fix ? { ...doc, ...fix } : doc;
}

/* ─── Rattachement aux fiches ─────────────────────────────────────────────── */

export type ClientRef = { id: number | string; companyName?: string | null; raisonSociale?: string | null; siren?: string | null };

const LEGAL = /\b(sarl|sas|sasu|eurl|sa|sci|groupe|ste|societe|et|fils|pere)\b/g;

/** Un nom comparable : sans accents, forme juridique ni ponctuation. */
export const nameKey = (s?: string | null): string =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(LEGAL, " ")
    .replace(/[^a-z0-9]/g, "");

/**
 * La fiche d'un client Axonaut : par SIREN d'abord, sinon par nom (nom de la
 * fiche ou raison sociale, l'un contenant l'autre). Null si rien, ou si le nom
 * désigne plusieurs fiches — on ne devine pas.
 */
export function matchClient(doc: Pick<AxonautDoc, "siren" | "clientName">, clients: ClientRef[]): { id: number | string; by: "siren" | "nom" } | null {
  if (doc.siren) {
    const bySiren = clients.filter((c) => (c.siren ?? "").replace(/\D/g, "").slice(0, 9) === doc.siren);
    if (bySiren.length === 1) return { id: bySiren[0].id, by: "siren" };
  }
  const k = nameKey(doc.clientName);
  if (k.length < 3) return null;
  const byName = clients.filter((c) =>
    [c.companyName, c.raisonSociale].some((n) => {
      const nk = nameKey(n);
      // Égaux, ou l'un contient l'autre — mais pas un nom court perdu dans un long (« erg » dans « solarenergy »).
      return nk.length >= 3 && (nk === k || (Math.min(nk.length, k.length) >= 5 && (nk.includes(k) || k.includes(nk))));
    }),
  );
  return byName.length === 1 ? { id: byName[0].id, by: "nom" } : null;
}

/**
 * Le rattachement de toutes les factures. Le SIREN n'apparaît pas sur les plus
 * anciennes : celui qu'un client porte sur une facture vaut pour toutes celles
 * à son nom (Afonso n'a son SIREN qu'à partir d'août 2026, et son nom Axonaut
 * n'est pas celui de sa fiche).
 */
export function matchAll(docs: AxonautDoc[], clients: ClientRef[]): Map<string, { id: number | string; by: "siren" | "nom" } | null> {
  const sirenOf = new Map<string, string>();
  for (const d of docs) if (d.siren && !sirenOf.has(d.clientName)) sirenOf.set(d.clientName, d.siren);
  return new Map(docs.map((d) => [d.number, matchClient({ clientName: d.clientName, siren: d.siren ?? sirenOf.get(d.clientName) ?? null }, clients)]));
}
