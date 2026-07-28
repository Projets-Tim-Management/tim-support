// ─── Features ────────────────────────────────────────────────────────────────

export type FeatureStatus = 'Disponible' | 'Beta' | 'Prochainement';
export type MediaPosition  = 'Droite' | 'Gauche';

export interface FeatureTerm {
  id:      number;
  name:    string;
  slug:    string;
  count?:  number;
  parent?: number;
}

export type MediaDocItem =
  | { acf_fc_layout: 'img';      img:     WPMedia }
  | { acf_fc_layout: 'galerie';  galerie: WPMedia[] }
  | { acf_fc_layout: 'editeur';  editeur: string }
  | { acf_fc_layout: 'fichier';  fichier: { url: string; filename: string; filesize: number; mime_type: string } };

export interface DocSection {
  title_doc:       string;
  description_doc: string;
  media_doc:       MediaDocItem[];
  media_position:  MediaPosition;
}

export interface FeatureACF {
  title_feature:     string;
  short_description: string;
  status:            FeatureStatus;
  doc:               DocSection[];
  // Champ optionnel : mots-clés / synonymes saisis par les rédacteurs pour
  // capturer le langage utilisateur (ex: "masquer panneau, cacher barre").
  // Accepte une textarea (séparateurs , ; saut de ligne) ou un repeater.
  keywords?:         string | string[];
}

export interface FeatureFeedback {
  helpful:     number;
  not_helpful: number;
}

export interface Feature {
  id:         number;
  slug:       string;
  title:      string;
  thumbnail:  string | null;
  platforms:  FeatureTerm[];
  categories: FeatureTerm[];
  acf:        FeatureACF;
  feedback:   FeatureFeedback;
  date:       string;     // ISO 8601 UTC — date de création (post_date_gmt)
  modified:   string;
  content?:   string;     // uniquement sur la fiche complète
  search_h2?: string[];   // index pré-calculé côté WP, uniquement en mode liste
  search_h3?: string[];
}

// ─── Espace partenaires : points & récompenses ───────────────────────────────

export type PointsSource = 'contrat' | 'avis' | 'ajustement' | 'echange';

export interface PointsEntry {
  delta:      number;       // > 0 crédit, < 0 débit
  motif:      string;
  source:     PointsSource;
  ref:        string | null;
  created_at: string;       // ISO 8601
}

export interface PointsSummary {
  email:   string;
  balance: number;
  history: PointsEntry[];
  code:    string;       // code partenaire unique (parrainage / leads)
}

export type MissionType = 'preuve' | 'manuelle';
export type MissionPartnerStatus = 'none' | 'pending' | 'approved';

export interface Mission {
  id:             number;
  title:          string;
  description:    string;
  points:         number;
  url:            string;
  type:           MissionType;
  image:          string | null;
  repeatable:     boolean;
  partner_status: MissionPartnerStatus;   // statut pour le partenaire courant
}

export interface MissionSubmitResult {
  success?:           boolean;
  submission_number?: number;
  code?:              string;
  message?:           string;
}

export interface Reward {
  id:          number;
  slug:        string;
  title:       string;
  description: string;
  cost:        number;       // coût en points
  stock:       number;       // -1 = illimité
  image:       string | null;
}

export interface RedeemResult {
  success?:      boolean;
  order_number?: number;
  balance?:      number;
  code?:         string;
  message?:      string;
}

// ─── Types WordPress (legacy / migration) ──────────────────────────────────────

export interface WPMedia {
  id: number;
  source_url: string;
  alt_text: string;
  media_details: {
    width: number;
    height: number;
    sizes: Record<string, { source_url: string; width: number; height: number }>;
  };
}


// ─── Parcours d'apprentissage ────────────────────────────────────────────────

export type ParcoursProfil = "admin" | "conducteur" | "chef-chantier" | "compagnon" | "";

export interface ParcoursSummary {
  id:         number;
  slug:       string;
  title:      string;
  intro:      string;
  profil:     ParcoursProfil;
  order:      number;   // menu_order WP, croissant
  step_count: number;
  modified:   string;
}

export interface ParcoursFull extends Omit<ParcoursSummary, "step_count"> {
  steps: Feature[]; // features ordonnées, embedded en full (avec content)
}
