/**
 * Les canaux d'acquisition — registre UNIQUE.
 *
 * La liste existait en quatre exemplaires : le canal d'une soumission
 * (`CHANNELS`, forms), la « Provenance » d'une opportunité (options de
 * `partner-clients`), la correspondance de l'un vers l'autre (to-opportunity)
 * et les libellés de l'analyse du pipeline. Ajouter une régie demandait de les
 * retrouver toutes ; en oublier une ne cassait rien de visible, un chiffre
 * tombait juste dans « inconnu ».
 *
 * Une entrée porte les DEUX valeurs historiques, sans les renommer : `sea` sur
 * une soumission, `google-ads-sea` sur une opportunité. Ce sont des
 * identifiants stockés — les harmoniser ferait mentir l'historique. Les canaux
 * ajoutés depuis prennent la même valeur des deux côtés.
 *
 * ⚠️ Les deux champs sont des `select`, donc des enums Postgres : chaque valeur
 * ajoutée coûte une migration (`ALTER TYPE … ADD VALUE`), et l'ORDRE du registre
 * est l'ordre des enums. Une nouvelle entrée s'ajoute là où la migration la
 * place — en fin de liste, sauf à l'écrire `BEFORE` une valeur existante.
 */

export type ChannelEntry = {
  /** Valeur sur une soumission de formulaire. `null` : n'existe que sur une opportunité. */
  channel: string | null;
  /** Valeur de la « Provenance » d'une opportunité. */
  source: string;
  label: string;
  /**
   * Clic acheté. Pas décoratif : c'est lui qui décide ce qu'on mesure comme
   * « clic payant identifié ». Sans ce drapeau, chaque nouvelle régie devait être
   * ajoutée à la main dans les statistiques — et un oubli n'y ferait pas d'erreur
   * visible, juste un chiffre trop bas que personne ne saurait interpréter.
   */
  paid: boolean;
};

export const CHANNEL_REGISTRY = [
  { channel: null, source: "manuelle", label: "Saisie manuelle", paid: false },
  { channel: "seo", source: "site-vitrine-seo", label: "Site vitrine — SEO", paid: false },
  { channel: "sea", source: "google-ads-sea", label: "Google Ads — SEA", paid: true },
  { channel: "chatgpt", source: "chatgpt-ads-sea", label: "ChatGPT Ads — SEA", paid: true },
  // Publicité sur réseau social, pas sur moteur de recherche : payante, mais pas
  // « SEA ». Le support (Facebook ou Instagram) est dit par Meta à chaque clic
  // (`utm_source={{site_source_name}}`, voir forms/lib/channel.ts).
  { channel: "meta-facebook", source: "meta-facebook", label: "Meta Ads — Facebook", paid: true },
  { channel: "meta-instagram", source: "meta-instagram", label: "Meta Ads — Instagram", paid: true },
  // Fiches importées de Brevo, qui ne distinguait pas SEO et SEA.
  { channel: null, source: "site-vitrine", label: "Site vitrine (import Brevo)", paid: false },
] as const satisfies readonly ChannelEntry[];

type Entry = (typeof CHANNEL_REGISTRY)[number];
type FormEntry = Extract<Entry, { channel: string }>;

/** Canal porté par une soumission. */
export type Channel = FormEntry["channel"];
/** Provenance portée par une opportunité. */
export type Provenance = Entry["source"];

const isFormEntry = (e: Entry): e is FormEntry => e.channel !== null;

/** Les canaux d'une soumission, au format des options d'un `select`. */
export const CHANNELS = CHANNEL_REGISTRY.filter(isFormEntry).map((e) => ({
  label: e.label,
  value: e.channel,
  paid: e.paid,
}));

/** Les provenances d'une opportunité, au format des options d'un `select`. */
export const PROVENANCE_OPTIONS = CHANNEL_REGISTRY.map((e) => ({ label: e.label, value: e.source }));

/** Canal d'une soumission → provenance de l'opportunité qui en naît. */
export const SOURCE_BY_CHANNEL = Object.fromEntries(
  CHANNEL_REGISTRY.filter(isFormEntry).map((e) => [e.channel, e.source]),
) as Record<Channel, Provenance>;

/** Le canal désigne-t-il un clic acheté ? */
export const isPaidChannel = (value?: string | null): boolean =>
  CHANNELS.some((c) => c.value === value && c.paid);

export const channelLabel = (value?: string | null): string | undefined =>
  CHANNELS.find((c) => c.value === value)?.label;

export const provenanceLabel = (value?: string | null): string | undefined =>
  CHANNEL_REGISTRY.find((e) => e.source === value)?.label;
