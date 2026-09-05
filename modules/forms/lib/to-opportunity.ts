import type { Attribution } from "@/modules/forms/lib/ingest";
import type { Channel } from "@/modules/forms/lib/form-schema";
import type { PublicForm } from "@/modules/forms/lib/public-schema";
import type { AnswerValue } from "@/modules/forms/lib/validate";
import { channelLabel } from "@/modules/forms/lib/form-schema";

/**
 * Traduction d'une soumission en opportunité — partie PURE, donc testable sans
 * base de données.
 *
 * Principe : ce qui a un sens commercial devient un champ de la fiche ; le reste
 * est écrit en clair dans la « demande du lead », pour que le commercial lise ce
 * que la personne a réellement demandé sans ouvrir la soumission brute.
 *
 * Les LIBELLÉS sont utilisés partout, jamais les valeurs stockées : « Pointage »
 * et non « pointage », « 11 - 25 » et non « 11-25 ».
 */

/** Canal d'acquisition → valeur du champ « Provenance » d'une opportunité. */
const SOURCE_BY_CHANNEL: Record<Channel, string> = {
  seo: "site-vitrine-seo",
  sea: "google-ads-sea",
  chatgpt: "chatgpt-ads-sea",
};

export interface OpportunityDraft {
  companyName: string;
  email?: string;
  phone?: string;
  source: string;
  /** Effectif, en clair (« 11 - 25 »). Voir le champ dans PartnerClients. */
  collaborateurs?: string;
  leadNotes: string;
  contact: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    role: string;
  };
}

/**
 * « Pierre Ibled » → prénom + nom, le dernier mot faisant le nom de famille.
 * Repris de l'import Brevo, qui disparaîtra ; le formulaire ne demande lui aussi
 * qu'un seul champ « nom ».
 */
export function splitName(full?: unknown): { firstName?: string; lastName?: string } {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** `"0620311882"` → `"+33 6 20 31 18 82"`. Laisse tel quel ce qu'il ne sait pas lire. */
export function normalizePhone(raw?: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return undefined;
  const national = digits.startsWith("33") ? digits.slice(2) : digits.replace(/^0/, "");
  if (national.length !== 9) return value;
  const [head, ...rest] = [national.slice(0, 1), ...(national.slice(1).match(/.{1,2}/g) ?? [])];
  return `+33 ${head} ${rest.join(" ")}`;
}

const str = (v: AnswerValue | undefined): string => (typeof v === "string" ? v.trim() : "");

/** Libellé d'une option, à défaut la valeur brute — la fiche doit rester lisible. */
function labelOf(form: PublicForm, fieldName: string, value: string): string {
  if (!value) return "";
  const field = form.fields.find((f) => f.name === fieldName);
  return field?.options?.find((o) => o.value === value)?.label ?? value;
}

function labelsOf(form: PublicForm, fieldName: string, value: AnswerValue | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((v) => labelOf(form, fieldName, v)).filter(Boolean);
}

/**
 * Nom d'entreprise. Le champ est obligatoire aujourd'hui, mais il peut cesser de
 * l'être en back-office : sans repli, la fiche serait alors créée sans titre.
 */
function companyNameOf(answers: Record<string, AnswerValue>, email: string): string {
  const declared = str(answers.company_name);
  if (declared) return declared;

  const domain = email.split("@")[1] ?? "";
  const PUBLIC = ["gmail.com", "orange.fr", "wanadoo.fr", "hotmail.fr", "hotmail.com", "outlook.fr", "outlook.com", "yahoo.fr", "free.fr", "sfr.fr", "laposte.net", "icloud.com", "live.fr"];
  if (domain && !PUBLIC.includes(domain.toLowerCase())) {
    const label = domain.split(".")[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return str(answers.nom) || email || "Lead sans nom";
}

const frDate = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

export function buildOpportunity(args: {
  form: PublicForm;
  answers: Record<string, AnswerValue>;
  attribution: Attribution;
  channel: Channel;
  receivedAt?: Date;
}): OpportunityDraft {
  const { form, answers, attribution, channel } = args;
  const receivedAt = args.receivedAt ?? new Date();

  const email = str(answers.email).toLowerCase();
  const phone = normalizePhone(answers.telephone);
  const companyName = companyNameOf(answers, email);
  const { firstName, lastName } = splitName(answers.nom);

  const civilite = labelOf(form, "genre", str(answers.genre));
  const fonction = labelOf(form, "fonction", str(answers.fonction));
  const pays = labelOf(form, "pays", str(answers.pays));
  const effectif = labelOf(form, "collaborateurs", str(answers.collaborateurs));
  const besoins = labelsOf(form, "besoins", answers.besoins);

  const lines = [`Lead du site vitrine reçu le ${frDate(receivedAt)}.`];
  if (besoins.length) lines.push(`Besoins exprimés : ${besoins.join(", ")}.`);

  // La civilité et la fonction n'ont pas de champ dédié sur le contact : elles
  // vivent ici, où le commercial les lit avant de décrocher son téléphone.
  const who = [civilite, firstName, lastName].filter(Boolean).join(" ");
  const identity = [who, fonction, phone].filter(Boolean).join(" · ");
  if (identity) lines.push(`Contact : ${identity}.`);
  if (pays) lines.push(`Pays : ${pays}.`);

  const origin = [
    channelLabel(channel),
    attribution.sourcePagePath ? `page ${attribution.sourcePagePath}` : "",
    attribution.lpVariant ? `variante ${attribution.lpVariant}` : "",
    attribution.utmCampaign ? `campagne ${attribution.utmCampaign}` : "",
  ].filter(Boolean);
  lines.push(`Origine : ${origin.join(" · ")}.`);

  return {
    companyName,
    email: email || undefined,
    phone,
    source: SOURCE_BY_CHANNEL[channel],
    collaborateurs: effectif || undefined,
    leadNotes: lines.join("\n"),
    contact: {
      firstName,
      lastName,
      email: email || undefined,
      phone,
      // Le rôle est un texte libre : la fonction déclarée y a tout à fait sa
      // place, et dit plus que « Contact du site vitrine ».
      role: fonction || "Contact du site vitrine",
    },
  };
}
