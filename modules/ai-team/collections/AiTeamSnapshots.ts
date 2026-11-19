import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";

/**
 * LA PHOTO DE LA SEMAINE (B2 de l'apprentissage, 12/11/2026) : chaque lundi
 * matin, le code enregistre les chiffres du moment — la fiche des canaux de
 * Yanis, et les 30 derniers jours lus par Thomas (Google Ads) et Sarah
 * (ChatGPT Ads). Aucun appel IA : ça ne coûte rien.
 *
 * Mises bout à bout, les photos donnent les TENDANCES (« troisième semaine sans
 * conversion », « le coût du clic a pris 30 % ») et l'AVANT / APRÈS d'une
 * recommandation de Mark. Une par semaine ; écrite par le serveur seul.
 */
export const AiTeamSnapshots: CollectionConfig = {
  slug: "ai-team-snapshots",
  labels: { singular: "Photo de la semaine (équipe IA)", plural: "Photos de la semaine (équipe IA)" },
  admin: { useAsTitle: "week", defaultColumns: ["week", "createdAt"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-week",
  fields: [
    { name: "week", type: "text", label: "Semaine (lundi)", required: true, unique: true, index: true },
    { name: "channels", type: "json", label: "Fiche des canaux (3 mois glissants)" },
    { name: "google", type: "json", label: "Google Ads — 30 derniers jours" },
    { name: "chatgpt", type: "json", label: "ChatGPT Ads — 30 derniers jours" },
    { name: "tracking", type: "json", label: "Leads des 30 derniers jours, et combien au canal connu" },
    { name: "mastery", type: "json", label: "Score de maîtrise de chaque agent (sur 100)" },
    // Les indicateurs de la feuille de route qui ne sont pas dans la fiche des canaux (clics hors marque, IA…).
    { name: "metrics", type: "json", label: "Indicateurs de la feuille de route" },
    // Une photo tirée après coup de l'historique (un point par mois) : pour les courbes, jamais pour les tendances.
    { name: "reconstituted", type: "checkbox", label: "Reconstituée après coup", defaultValue: false, index: true },
  ],
};
