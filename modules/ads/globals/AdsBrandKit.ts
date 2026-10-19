import type { Field, GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";
import { HEX } from "@/core/lib/brand";
import { TONES } from "@/modules/ads/lib/dimensions";
import { AD_FONTS, PALETTE_DEFAULTS, TITLE_CASES } from "@/modules/ads/lib/style";

/**
 * Publicité › Paramètres › Kit de marque — la charte des publicités, que lit
 * chaque génération de textes et que l'agent recopie dans ses briefs Claude
 * Design (ton, logos, couleurs, typographie ; plan Publicité).
 *
 * Les couleurs des pubs vivent ICI, préremplies avec celles de Système ›
 * Apparence ; celles du contrat restent dans Apparence. Les noms des champs
 * d'avant sont conservés : les onglets ne changent rien à la base.
 */

const color = (name: keyof typeof PALETTE_DEFAULTS, label: string, description: string): Field => ({
  name,
  type: "text",
  label,
  defaultValue: PALETTE_DEFAULTS[name],
  validate: (v: unknown) => (!v || HEX.test(String(v)) ? true : "Code couleur au format #RRGGBB."),
  admin: { width: "33%", placeholder: PALETTE_DEFAULTS[name], description, components: { Field: "/admin/fields/ColorField#default" } },
});

const logo = (name: string, label: string, description: string): Field => ({
  name,
  type: "upload",
  relationTo: "ad-media",
  label,
  filterOptions: { kind: { equals: "logo" } },
  admin: { description, width: "33%" },
});

export const AdsBrandKit: GlobalConfig = {
  slug: "ads-brand-kit",
  label: "Kit de marque",
  admin: {
    group: "Publicité",
    description: "La charte des publicités : ton, logos, couleurs, typographie. L'agent la lit à chaque génération et la recopie dans ses briefs Claude Design.",
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Ton",
          description: "Comment TIM parle. C'est ce qui évite les formules que tout le secteur emploie.",
          fields: [
            {
              name: "defaultTone",
              type: "select",
              label: "Adresse par défaut",
              options: [...TONES],
              defaultValue: "vous",
              required: true,
              admin: { description: "Vouvoiement par défaut. Le tutoiement ne sort qu'en variante étiquetée « test de ton », validée comme toute créa." },
            },
            { name: "voice", type: "textarea", label: "Le ton, en quelques phrases", admin: { placeholder: "Direct, concret, avec l'humour de quelqu'un qui connaît le chantier. Jamais de jargon de start-up…" } },
            {
              type: "row",
              fields: [
                { name: "goodExamples", type: "textarea", label: "Des phrases justes", admin: { width: "50%" } },
                { name: "badExamples", type: "textarea", label: "Des phrases à éviter", admin: { width: "50%", placeholder: "« La solution digitale tout-en-un pour optimiser vos process »" } },
              ],
            },
            {
              name: "forbidden",
              type: "array",
              label: "Mentions interdites",
              labels: { singular: "Mention", plural: "Mentions" },
              admin: { description: "Refusées en code dans tout texte généré, sans tenir compte des majuscules ni des accents.", initCollapsed: false },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "term", type: "text", label: "Mot ou expression", required: true, admin: { width: "40%" } },
                    { name: "reason", type: "text", label: "Pourquoi", admin: { width: "60%" } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Logos",
          description: "Trois variantes, chacune pour sa place. Déposez-les dans Médias publicitaires, nature « Logo » (PNG transparent, WebP ou SVG) : elles se joignent aux briefs Claude Design.",
          fields: [
            {
              type: "row",
              fields: [
                logo("logoOnLight", "Couleur, pour fond clair", "Le logo complet, en couleurs."),
                logo("logoOnDark", "Blanc, pour fond sombre", "Blanc ou monochrome clair."),
                logo("logoSymbol", "Symbole seul", "Carré, sans texte : coin d'une vidéo, petits espaces."),
              ],
            },
            { name: "logoPreview", type: "ui", admin: { components: { Field: "/modules/ads/admin/BrandKitPreview#LogoPreview" } } },
          ],
        },
        {
          label: "Couleurs",
          description: "La palette des pubs, préremplie avec Système › Apparence. Le contraste de chaque couple est vérifié ci-dessous.",
          fields: [
            {
              name: "palette",
              type: "group",
              label: false,
              fields: [
                {
                  type: "row",
                  fields: [
                    color("primary", "Principale", "La couleur de la marque."),
                    color("accent", "Accent", "Boutons, mots mis en avant."),
                    color("darkBg", "Fond sombre", "Écrans de titre, fin de vidéo."),
                  ],
                },
                {
                  type: "row",
                  fields: [
                    color("lightBg", "Fond clair", "Écrans aérés, cartes."),
                    color("textOnDark", "Texte sur fond sombre", "En général blanc."),
                    color("textOnLight", "Texte sur fond clair", "En général la principale ou un noir."),
                  ],
                },
              ],
            },
            { name: "paletteCheck", type: "ui", admin: { components: { Field: "/modules/ads/admin/BrandKitPreview#PaletteCheck" } } },
          ],
        },
        {
          label: "Typographie",
          description: "Les polices des titres et des textes. Une police déposée en fichier (plus bas) passe avant celle de la liste.",
          fields: [
            {
              type: "row",
              fields: [
                { name: "titleFont", type: "select", label: "Police des titres", options: AD_FONTS.map(({ label, value }) => ({ label, value })), defaultValue: "montserrat", admin: { width: "40%" } },
                { name: "bodyFont", type: "select", label: "Police des textes", options: AD_FONTS.map(({ label, value }) => ({ label, value })), defaultValue: "inter", admin: { width: "40%" } },
                { name: "titleCase", type: "select", label: "Casse des titres", options: [...TITLE_CASES], defaultValue: "normale", admin: { width: "20%" } },
              ],
            },
            { name: "fontPreview", type: "ui", admin: { components: { Field: "/modules/ads/admin/BrandKitPreview#FontPreview" } } },
            {
              name: "fonts",
              type: "array",
              label: "Polices déposées",
              labels: { singular: "Police", plural: "Polices" },
              admin: { description: "Facultatif : votre propre police (TTF ou OTF, licence autorisant la publicité), déposée dans Médias publicitaires." },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "role", type: "select", label: "Rôle", required: true, options: [{ label: "Titres", value: "titre" }, { label: "Texte", value: "texte" }], admin: { width: "25%" } },
                    { name: "weight", type: "number", label: "Graisse", defaultValue: 400, min: 100, max: 900, admin: { width: "20%" } },
                    { name: "file", type: "upload", relationTo: "ad-media", label: "Fichier", required: true, filterOptions: { kind: { equals: "police" } }, admin: { width: "55%" } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Fin de pub",
          fields: [
            {
              name: "endCard",
              type: "group",
              label: false,
              fields: [{ name: "url", type: "text", label: "Adresse affichée", defaultValue: "tim-management.co", admin: { description: "Écrite à la fin des vidéos et sur les visuels, d'après le brief." } }],
            },
          ],
        },
        {
          label: "Mentions légales",
          fields: [
            { name: "advertiser", type: "text", label: "Annonceur", admin: { placeholder: "LC DEV — TIM Management" } },
            { name: "legalNotice", type: "textarea", label: "Mentions obligatoires", admin: { description: "Ajoutées au fichier de textes téléchargé avec chaque créa." } },
          ],
        },
      ],
    },
  ],
};
