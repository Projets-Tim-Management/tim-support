#!/usr/bin/env node
/**
 * Compile le projet vidéo des pubs (remotion/) dans remotion-bundle/, lu à
 * l'exécution par la fonction de rendu (modules/ads/video/render.ts) et déposé
 * dans la Sandbox Vercel. Lancé par `npm run build`, avant Next.
 *
 * Les cartes de source (.map) des morceaux secondaires sont retirées : elles
 * doublaient le poids du paquet, envoyé dans la Sandbox à chaque rendu. Celle
 * du fichier principal reste : le moteur de rendu l'ouvre au démarrage (sans
 * elle, « ENOENT bundle.js.map ») et s'en sert pour situer une erreur.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "remotion-bundle");
rmSync(out, { recursive: true, force: true });
execFileSync("npx", ["remotion", "bundle", "remotion/index.ts", "--out-dir", "remotion-bundle", "--log=error"], { cwd: root, stdio: "inherit" });

let removed = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".map") && name !== "bundle.js.map") {
      rmSync(p);
      removed++;
    }
  }
};
walk(out);
console.log(`[vidéo] projet compilé dans remotion-bundle/ (${removed} cartes de source retirées).`);
