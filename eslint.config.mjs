import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * Analyse statique du projet (ESLint 9, configuration « plate »).
 *
 * `next/core-web-vitals` embarque les règles React, celles des hooks
 * (dépendances manquantes, appels conditionnels) et les garde-fous Next —
 * exactement ce que `tsc` ne voit pas : il vérifie les types, pas les usages.
 * `next/typescript` ajoute les règles TypeScript correspondantes.
 *
 * ⚠️ `eslint-config-next` v16 exporte DÉJÀ une configuration plate : on l'étale
 * directement. Passer par `FlatCompat` (forme documentée pour les versions
 * antérieures) échoue ici sur « Converting circular structure to JSON ».
 */
const config = [
  {
    // Généré, compilé ou hors périmètre : jamais analysé.
    ignores: [
      ".next/**",
      "node_modules/**",
      "app/(payload)/admin/importMap.js", // généré par Payload
      "payload-types.ts", // généré par Payload
      "migrations/**", // SQL généré
      "public/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    name: "tim/calibrage",
    rules: {
      /**
       * Texte français : les apostrophes sont partout et React les rend
       * correctement. Échapper chaque `'` en `&apos;` rendrait les libellés
       * illisibles dans le code pour un gain nul.
       */
      "react/no-unescaped-entities": "off",

      /**
       * `set-state-in-effect` (compilateur React) désactivée — seule règle que
       * nous écartons, et à dessein.
       *
       * Elle proscrit « charger des données dans un effet puis appeler
       * setState ». Or c'est le SEUL moyen dont disposent les composants de ce
       * projet : les champs custom de Payload et les composants de vue sont des
       * composants CLIENT montés par le back-office — ils ne peuvent pas être des
       * Server Components, ni recevoir leurs données en props. Même chose pour
       * l'hydratation depuis `localStorage` (préférences de vue).
       *
       * Les autres règles de hooks restent actives, y compris `immutability`,
       * `purity` et `exhaustive-deps` : elles, nous les respectons.
       */
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
