import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Chiffrement des secrets stockés en base (jetons OAuth d'agenda).
 *
 * Un jeton de rafraîchissement vaut un accès permanent à l'agenda du partenaire :
 * il ne doit pas être lisible par quelqu'un qui obtiendrait une copie de la base.
 * AES-256-GCM — chiffré ET authentifié : une valeur altérée est rejetée au
 * déchiffrement au lieu de produire n'importe quoi.
 *
 * La clé dérive de `PAYLOAD_SECRET`. Conséquence à connaître : changer ce secret
 * rend les jetons existants illisibles, et les partenaires doivent reconnecter
 * leur agenda. C'est le comportement voulu (le secret est la racine de
 * confiance), mais ça se documente.
 */

const key = (): Buffer => {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) throw new Error("PAYLOAD_SECRET manquant : impossible de chiffrer les jetons d'agenda.");
  // SHA-256 du secret → 32 octets, la taille attendue par AES-256.
  return createHash("sha256").update(secret).digest();
};

/** Chiffre une chaîne. Format : iv.tag.données, en base64url. */
export const encryptSecret = (plain: string): string => {
  const iv = randomBytes(12); // 96 bits, taille recommandée pour GCM
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
};

/** Déchiffre. Renvoie null si la valeur est absente, malformée ou altérée. */
export const decryptSecret = (value?: string | null): string | null => {
  if (!value) return null;
  const [ivB64, tagB64, dataB64] = value.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Jeton chiffré avec un autre PAYLOAD_SECRET, ou corrompu.
    return null;
  }
};

/**
 * Jeton signé pour le paramètre `state` d'un flux OAuth.
 *
 * Sans lui, l'URL de retour accepterait n'importe quel appel : un tiers pourrait
 * faire rattacher SON agenda à la fiche d'un partenaire. Le state porte donc
 * l'identité de la demande, signée, avec une durée de vie courte.
 */
const sign = (body: string): string =>
  createHash("sha256").update(`${key().toString("base64")}.${body}`).digest("base64url");

export const signState = (payload: Record<string, unknown>, ttlSec = 600): string => {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
};

export const readState = <T = Record<string, unknown>>(state?: string | null): T | null => {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp?: number };
    if (!parsed.exp || parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
};
