#!/usr/bin/env node
/**
 * Catalogue de récompenses initial (programme partenaire TIM).
 *
 * Parti pris : des CADEAUX, hors chantier et hors produit TIM. Le partenaire-
 * utilisateur passe déjà sa journée sur les chantiers et dans le logiciel — la
 * récompense doit être une respiration, pas un outil de plus.
 *
 * Barème calé sur les missions existantes : 1 550 points gagnables aujourd'hui
 * (5 avis / notations, 150 à 500 pts). Quatre paliers, avec un premier cadeau
 * atteignable dès la première mission et des lots hauts qui donnent une raison
 * de revenir quand de nouvelles missions seront publiées.
 *
 * Idempotent : un slug déjà présent est ignoré. Les entrées d'une version
 * précédente du catalogue (RETIRED_SLUGS) sont supprimées, sauf si une commande
 * les référence — auquel cas elles sont mises à 0 (épuisé), ce qui les masque du
 * catalogue sans casser l'historique des commandes.
 *
 * Usage : node scripts/seed-rewards.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const projectDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(projectDir, ".env.local"), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

/** Paragraphe Lexical (format richText de Payload). */
const richText = (text) => ({
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: "ltr",
    children: [
      {
        type: "paragraph",
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        textFormat: 0,
        children: [{ type: "text", detail: 0, format: 0, mode: "normal", style: "", text, version: 1 }],
      },
    ],
  },
});

/** Première version du catalogue (matériel de chantier + avantages produit). */
const RETIRED_SLUGS = [
  // Remplacée par la carte illicado « Merci » 50 €, de marque identifiable.
  "carte-cadeau-50",
  "casquette-tim",
  "pack-epi",
  "kit-mesure-chantier",
  "mois-licence-offert",
  "session-prise-en-main",
  "etude-de-cas",
  "enceinte-chantier",
  "perceuse-visseuse-18v",
  "gourde-isotherme-tim",
  "carte-carburant-25",
];

// stock : -1 = illimité ; un nombre = série limitée (0 masque du catalogue).
const REWARDS = [
  // ── Plaisirs simples : atteignables dès la première mission ───────────────
  {
    slug: "coffret-chocolats",
    title: "Coffret de chocolats artisanaux",
    cost: 150,
    stock: -1,
    description: "Ballotin de 250 g d'un chocolatier français, livré chez vous.",
  },
  {
    slug: "gourde-isotherme",
    title: "Gourde isotherme 750 ml",
    cost: 250,
    stock: -1,
    description: "Bouteille inox double paroi : 12 h au chaud, 24 h au froid.",
  },
  {
    slug: "carte-cadeau-10",
    title: "Carte cadeau 10 €",
    cost: 350,
    stock: -1,
    description: "Carte multi-enseignes de 10 €, envoyée par e-mail sous 48 h.",
  },
  // ── Se faire plaisir ──────────────────────────────────────────────────────
  {
    slug: "streaming-3-mois",
    title: "3 mois de streaming au choix",
    cost: 500,
    stock: -1,
    description: "Trois mois offerts sur la plateforme de votre choix : films, séries ou musique.",
  },
  {
    slug: "coffret-degustation",
    title: "Coffret dégustation régional",
    cost: 650,
    stock: -1,
    description: "Sélection de produits d'une région française : épicerie fine ou bières artisanales.",
  },
  {
    slug: "carte-cadeau-25",
    title: "Carte cadeau 25 €",
    cost: 800,
    stock: -1,
    description: "Carte multi-enseignes de 25 €, envoyée par e-mail sous 48 h.",
  },
  {
    slug: "bon-restaurant",
    title: "Dîner pour deux (bon de 60 €)",
    cost: 950,
    stock: -1,
    description: "Bon de 60 € valable dans plus de 3 000 restaurants partout en France.",
  },
  {
    slug: "don-association",
    title: "Don de 50 € à l'association de votre choix",
    cost: 800,
    stock: -1,
    description: "TIM verse 50 € en votre nom à l'association que vous désignez.",
  },
  // ── Belles pièces ─────────────────────────────────────────────────────────
  {
    slug: "enceinte-bluetooth",
    title: "Enceinte Bluetooth portable",
    cost: 1200,
    stock: -1,
    description: "Enceinte nomade étanche, 20 h d'autonomie.",
  },
  // ── Cartes cadeaux illicado « Merci » ─────────────────────────────────────
  // Multi-enseignes (170+ enseignes), valable 12 mois, montant libre de 15 à
  // 150 € — source : illicado.com. Barème : ~30 points par euro, aligné sur les
  // cartes cadeaux déjà au catalogue (10 € = 350 pts, 25 € = 800 pts).
  {
    slug: "illicado-merci-50",
    title: "Carte cadeau illicado « Merci » — 50 €",
    cost: 1500,
    stock: -1,
    description:
      "50 € à dépenser dans plus de 170 enseignes, en magasin comme en ligne, en une ou plusieurs fois. Valable 12 mois.",
  },
  {
    slug: "illicado-merci-100",
    title: "Carte cadeau illicado « Merci » — 100 €",
    cost: 3000,
    stock: -1,
    description:
      "100 € à dépenser dans plus de 170 enseignes, en magasin comme en ligne, en une ou plusieurs fois. Valable 12 mois.",
  },
  {
    slug: "casque-audio",
    title: "Casque audio à réduction de bruit",
    cost: 1800,
    stock: 12,
    description: "Casque sans fil à réduction de bruit active, 30 h d'autonomie.",
  },
  // ── Grands lots : l'objectif à moyen terme ────────────────────────────────
  {
    slug: "montre-connectee",
    title: "Montre connectée",
    cost: 2200,
    stock: 8,
    description: "Montre connectée avec suivi d'activité, GPS et autonomie d'une semaine.",
  },
  {
    slug: "sejour-detente",
    title: "Coffret séjour détente (1 nuit pour 2)",
    cost: 2500,
    stock: 10,
    description: "Une nuit pour deux avec petit-déjeuner, à choisir parmi des centaines d'adresses.",
  },
  {
    slug: "machine-expresso",
    title: "Machine à expresso",
    cost: 3000,
    stock: 5,
    description: "Machine à café expresso avec buse vapeur, pour les cafés du matin comme au comptoir.",
  },
  {
    slug: "week-end-deux",
    title: "Week-end pour deux (2 nuits)",
    cost: 3800,
    stock: 3,
    description: "Coffret week-end : deux nuits pour deux personnes, hébergement de charme au choix.",
  },

  // ── Sorties & bien-être ───────────────────────────────────────────────────
  {
    slug: "caliceo-80",
    title: "Chèque cadeau Calicéo — 80 €",
    cost: 2400,
    stock: -1,
    description:
      "80 € à utiliser dans tous les centres Calicéo : bains à 33°, spa, soins et massages. Valable 1 an, en une ou plusieurs fois.",
  },
  {
    slug: "parc-asterix-80",
    title: "Parc Astérix — 80 € de billets",
    cost: 2400,
    stock: -1,
    description:
      "80 € à valoir sur la billetterie du Parc Astérix : une à deux entrées selon la date choisie.",
  },
  {
    slug: "disneyland-2-entrees",
    title: "Disneyland Paris — 2 entrées 1 jour",
    cost: 6600,
    stock: 2,
    description: "Deux billets 1 jour / 1 parc, à réserver à la date de votre choix.",
  },

  // ── High-tech : les lots vitrine ──────────────────────────────────────────
  // Coût = prix public constaté × ~30 points par euro (même barème que les
  // cartes cadeaux), arrondi.
  {
    slug: "airpods-4",
    title: "Apple AirPods 4",
    cost: 4500,
    stock: 5,
    description: "Écouteurs sans fil Apple, réduction de bruit et boîtier de charge USB-C (149 €).",
  },
  {
    slug: "apple-watch-se-3",
    title: "Apple Watch SE 3 — 40 mm, GPS",
    cost: 8000,
    stock: 3,
    description:
      "Boîtier aluminium 40 mm, écran toujours activé, capteur de température au poignet, 18 h d'autonomie et charge rapide (à partir de 269 €).",
  },
  {
    slug: "galaxy-tab-s10-lite",
    title: "Samsung Galaxy Tab S10 Lite — 128 Go, Wi-Fi",
    cost: 12000,
    stock: 2,
    description:
      "Tablette 10,9\" WUXGA+ 90 Hz, 128 Go, S Pen inclus, batterie 8 000 mAh et 7 ans de mises à jour (environ 399 €).",
  },
];

const url = process.env.DATABASE_URL;
const c = new pg.Client({
  connectionString: url,
  ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

// ── Retrait de l'ancienne version du catalogue ──────────────────────────────
for (const slug of RETIRED_SLUGS) {
  const found = await c.query(`select id, title from rewards where slug = $1`, [slug]);
  const row = found.rows[0];
  if (!row) continue;
  const used = await c.query(`select 1 from reward_orders where reward_id = $1 limit 1`, [row.id]);
  if (used.rowCount) {
    await c.query(`update rewards set stock = 0, updated_at = now() where id = $1`, [row.id]);
    console.log(`~ ${row.title} — commandée, conservée mais épuisée (masquée du catalogue)`);
  } else {
    await c.query(`delete from rewards where id = $1`, [row.id]);
    console.log(`✗ ${row.title} — retirée`);
  }
}

// ── Catalogue courant ───────────────────────────────────────────────────────
const existing = new Set((await c.query(`select slug from rewards`)).rows.map((r) => r.slug));
let created = 0;
for (const r of REWARDS) {
  if (existing.has(r.slug)) {
    console.log(`– ${r.title} (déjà présente)`);
    continue;
  }
  await c.query(
    `insert into rewards (title, slug, description, cost, stock, updated_at, created_at)
     values ($1, $2, $3, $4, $5, now(), now())`,
    [r.title, r.slug, JSON.stringify(richText(r.description)), r.cost, r.stock],
  );
  created += 1;
  console.log(`✓ ${r.title} — ${r.cost} pts`);
}
console.log(`\n${created} récompense(s) créée(s) sur ${REWARDS.length}.`);
await c.end();
