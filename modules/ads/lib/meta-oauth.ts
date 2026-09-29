import { decryptSecret, encryptSecret } from "@/core/lib/secrets";
import { META_DEFAULT_VERSION } from "@/modules/ads/platforms/meta";
import type { AccountSnapshot } from "@/modules/ads/platforms/types";

/**
 * Connexion OAuth d'un compte Meta — la partie sans réseau, donc testable.
 *
 * Le parcours : « Connecter un compte Meta » → écran de consentement Meta →
 * retour (callback) → jeton longue durée → les comptes publicitaires qu'il
 * ouvre. Un seul : il est connecté d'office. Plusieurs : on CHOISIT — et
 * pendant ce choix, le jeton attend dans un cookie HttpOnly, chiffré, de dix
 * minutes, lié au compte admin qui a lancé la connexion. Jamais dans l'URL : il
 * finirait dans l'historique du navigateur et les journaux.
 */

type Env = Record<string, string | undefined>;

/** Droits demandés. Lecture seule en phase 0 ; `ads_management` viendra avec les écritures (phase 2). */
export const META_SCOPES = ["ads_read"];

export const PENDING_COOKIE = "tim_ads_meta_pending";
/** Le cookie ne voyage que vers les routes Meta du module. */
export const PENDING_PATH = "/api/admin/ads/meta";
export const PENDING_TTL_SEC = 600;

export const ACCOUNTS_LIST = "/admin/collections/ad-accounts";

export const metaRedirectUri = (env: Env = process.env): string =>
  `${(env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001").replace(/\/$/, "")}${PENDING_PATH}/callback`;

export function metaAuthUrl(state: string, env: Env = process.env): string {
  const version = env.META_GRAPH_VERSION?.trim() || META_DEFAULT_VERSION;
  const u = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  u.searchParams.set("client_id", env.META_APP_ID ?? "");
  u.searchParams.set("redirect_uri", metaRedirectUri(env));
  u.searchParams.set("state", state);
  u.searchParams.set("scope", META_SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  return u.toString();
}

export type PendingConnection = { uid: string; token: string; expiresAt: string | null; exp: number };

/** Chiffré ET authentifié (AES-GCM) : ni lisible, ni falsifiable côté navigateur. */
export const sealPending = (p: Omit<PendingConnection, "exp">, now: Date): string =>
  encryptSecret(JSON.stringify({ ...p, exp: Math.floor(now.getTime() / 1000) + PENDING_TTL_SEC }));

/** Le choix en attente, s'il est intact, pas échu, et lancé par CE compte admin. */
export function openPending(value: string | undefined | null, uid: string | number, now: Date): PendingConnection | null {
  const clear = decryptSecret(value);
  if (!clear) return null;
  try {
    const p = JSON.parse(clear) as PendingConnection;
    if (p.uid !== String(uid) || !p.token || p.exp * 1000 < now.getTime()) return null;
    return p;
  } catch {
    return null;
  }
}

/** Où renvoyer l'admin après le retour de Meta, et avec quel message. */
export type Outcome =
  | { kind: "none" }
  | { kind: "single"; account: AccountSnapshot }
  | { kind: "choose"; count: number };

export const outcomeOf = (accounts: AccountSnapshot[]): Outcome =>
  accounts.length === 0 ? { kind: "none" } : accounts.length === 1 ? { kind: "single", account: accounts[0] } : { kind: "choose", count: accounts.length };

/** Messages de retour sur la liste des comptes (paramètre `connexion`). */
export const CONNECTION_NOTICES = {
  ok: "Compte connecté. Ses campagnes et ses chiffres arriveront à la prochaine synchro.",
  choix: "Ce jeton ouvre plusieurs comptes publicitaires : choisissez celui à connecter.",
  aucun: "Meta n'a renvoyé aucun compte publicitaire pour cet utilisateur : vérifiez ses droits dans le Business Manager.",
  annulee: "Connexion annulée chez Meta — rien n'a changé.",
  expiree: "La demande de connexion a expiré ou ne vous appartient pas : relancez « Connecter un compte Meta ».",
  erreur: "La connexion a échoué.",
} as const;

export type NoticeKey = keyof typeof CONNECTION_NOTICES;
