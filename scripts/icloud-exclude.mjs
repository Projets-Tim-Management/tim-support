#!/usr/bin/env node
/**
 * Soustrait les dossiers de travail à la synchronisation iCloud.
 *
 * Le dépôt vit dans `~/Documents`, et « Bureau et Documents » est synchronisé.
 * iCloud y recopie tout, y compris les dizaines de milliers de fichiers que
 * Next et npm regénèrent sans arrêt. Deux dégâts constatés le 27-28/08/2026 :
 * des copies de conflit jusque dans `.git` (huit `index N`), et un serveur de
 * dev qui mettait **14 minutes** à compiler une page.
 *
 * L'attribut étendu ci-dessous est le moyen prévu par macOS pour exclure un
 * dossier sans le déplacer. Mais il vit AVEC le dossier : un `rm -rf .next`
 * l'emporte, et l'oubli est silencieux — tout continue de marcher, simplement
 * cent fois plus lentement. D'où ce script, appelé avant `dev` et `build`
 * plutôt que laissé à la mémoire de quelqu'un.
 *
 * Sans effet ailleurs que sur macOS : la commande manque, on passe.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ATTR = "com.apple.fileprovider.ignore#P";

for (const name of [".git", "node_modules", ".next"]) {
  const path = join(root, name);
  // `.next` n'existe pas encore au tout premier lancement : on le crée pour
  // poser l'attribut AVANT que Next n'y écrive ses milliers de fichiers.
  if (!existsSync(path)) {
    if (name !== ".next") continue;
    mkdirSync(path, { recursive: true });
  }
  try {
    const current = execFileSync("xattr", ["-p", ATTR, path], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    if (current === "1") continue;
  } catch {
    /* attribut absent : on le pose ci-dessous */
  }
  try {
    execFileSync("xattr", ["-w", ATTR, "1", path]);
    console.log(`[icloud] ${name} exclu de la synchronisation`);
  } catch {
    /* pas macOS, ou xattr indisponible : sans objet */
  }
}
