import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Le banc de test ne voit JAMAIS la configuration du poste.
 *
 * Constaté le 29/09/2026 : la suite lancée depuis un shell où `.env.local`
 * avait été chargé (pour une commande Payload) a échoué sur un test de
 * désinscription — `NEXT_PUBLIC_SITE_URL` valait localhost. Rien n'est parti ce
 * jour-là, mais rien ne l'empêchait non plus : les vraies clés (base partagée
 * avec la production, Brevo, Pennylane, Meta) étaient dans l'environnement.
 *
 * Deux barrières, quel que soit le chemin par lequel les variables arrivent
 * (shell, IDE, `loadEnvFile`) :
 *  1. toute variable DÉCLARÉE dans `.env.local` est retirée — on lit les noms,
 *     jamais les valeurs ;
 *  2. le réseau réel est coupé : `fetch` lève. Un test qui a besoin d'une
 *     réponse la simule (`vi.stubGlobal("fetch", …)` ou un `fetch` injecté) ;
 *     `vi.unstubAllGlobals()` rend ce `fetch` bloquant, pas le vrai.
 */

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

export const LOCAL_ENV_FILES = [".env.local", ".env.development.local", ".env.production.local", ".env"];

export function declaredNames(file: string): string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
    .filter((n): n is string => Boolean(n));
}

/** Au cas où un fichier manquerait sur le poste : les secrets connus, par leur nom. */
const ALWAYS_REMOVED = [
  "DATABASE_URL",
  "PAYLOAD_SECRET",
  "BREVO_API_KEY",
  "BREVO_SMTP_USER",
  "BREVO_SMTP_KEY",
  "PENNYLANE_API_TOKEN",
  "INSEE_API_KEY",
  "ANTHROPIC_API_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET",
  "FORMS_INGEST_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_MAIL_CLIENT_SECRET",
  "NEXT_PUBLIC_SITE_URL",
];

const removed = new Set([...LOCAL_ENV_FILES.flatMap((f) => declaredNames(path.join(root, f))), ...ALWAYS_REMOVED]);
removed.delete("TZ"); // réglé par setup-tz.ts
for (const name of removed) delete process.env[name];

export class NetworkBlockedError extends Error {
  constructor(target: string) {
    super(`Réseau interdit dans les tests (${target}) : simulez la réponse avec vi.stubGlobal("fetch", …) ou un fetch injecté.`);
    this.name = "NetworkBlockedError";
  }
}

globalThis.fetch = (async (input: string | URL | Request) => {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  throw new NetworkBlockedError(target);
}) as typeof fetch;
