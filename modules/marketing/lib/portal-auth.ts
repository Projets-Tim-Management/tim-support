import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Authentification de l'espace client — code à usage unique, pas de mot de passe.
 *
 * Le client saisit son e-mail, reçoit un code à 6 chiffres, et obtient une
 * session de 24 h. Il n'y a donc AUCUN mot de passe à retenir, à réinitialiser
 * ni à voler : c'est le point du dispositif, pas une simplification.
 *
 * Trois garde-fous, tous indispensables sur un formulaire public :
 *  - le code est stocké HACHÉ (jamais en clair, même en base) ;
 *  - il expire en 15 min, ne sert qu'une fois, et 5 essais ratés l'invalident ;
 *  - la demande de code est limitée à 5 par heure et par compte.
 */

const SECRET = () => process.env.PAYLOAD_SECRET || "";

export const PORTAL_COOKIE = "tim_portal";
/** Durée de session : le client redemande un code toutes les 24 h. */
export const SESSION_MAX_AGE_S = 24 * 60 * 60;
/** Un code vit 15 minutes — assez pour aller chercher son e-mail, pas plus. */
export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_REQUESTS_PER_HOUR = 5;

// ─── Code à usage unique ─────────────────────────────────────────────────────
/** Code à 6 chiffres, tiré d'une source cryptographique (jamais Math.random). */
export const generateCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Empreinte du code. Le clair ne quitte jamais l'envoi de l'e-mail. */
export const hashCode = (code: string): string =>
  createHmac("sha256", SECRET()).update(code).digest("hex");

/** Comparaison à temps constant : une comparaison naïve fuit le code chiffre à chiffre. */
export const codeMatches = (code: string, hash?: string | null): boolean => {
  if (!hash) return false;
  const a = Buffer.from(hashCode(code), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
};

// ─── Session signée ──────────────────────────────────────────────────────────
export type PortalSession = {
  /** Id du compte portail. */
  aid: string;
  /** Id du client (entreprise) — c'est le périmètre de tout ce qui est lisible. */
  cid: string;
  /** Expiration, en secondes epoch. */
  exp: number;
};

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const unb64url = (s: string) => Buffer.from(s, "base64url").toString();

const sign = (body: string): string =>
  createHmac("sha256", SECRET()).update(body).digest("base64url");

/** Jeton `payload.signature` — pas un JWT, mais la même idée, sans dépendance. */
export const createSessionToken = (aid: string | number, cid: string | number): string => {
  const session: PortalSession = {
    aid: String(aid),
    cid: String(cid),
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_S,
  };
  const body = b64url(JSON.stringify(session));
  return `${body}.${sign(body)}`;
};

/** Renvoie la session si le jeton est intègre ET non expiré, sinon null. */
export const readSessionToken = (token?: string | null): PortalSession | null => {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(unb64url(body)) as PortalSession;
    if (!session?.aid || !session?.cid) return null;
    if (session.exp * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
};

/** Attributs du cookie de session (identiques à la pose et à la suppression). */
export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

// ─── E-mail du code ──────────────────────────────────────────────────────────
// Le gabarit vit avec les autres messages du parcours (modules/marketing/lib/
// emails) : un seul endroit pour la charte, un seul ton.
export { codeEmail } from "./code-email";
