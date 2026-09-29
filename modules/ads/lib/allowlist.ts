import { MOCK_ACCOUNT_ID } from "@/modules/ads/platforms/meta-mock";

/**
 * Les comptes publicitaires que le support a le droit de connecter.
 *
 * Le profil qui connecte voit TOUS ses comptes — ceux de TIM et ses comptes
 * personnels. Compter sur la vigilance au moment du choix, c'est accepter qu'un
 * jour un compte personnel entre dans le tableau de bord, et que plus tard un
 * agent y dépense. D'où une liste, posée en variable :
 *
 *   META_ALLOWED_AD_ACCOUNTS=act_211325410243618
 *
 * FERMÉE PAR DÉFAUT : sans la variable, aucun compte réel n'est accepté. Oublier
 * de la poser bloque la connexion, avec un message qui dit laquelle poser —
 * jamais l'inverse. Seul le compte simulé passe, et seulement en données
 * simulées.
 *
 * Appliquée côté serveur partout où un compte entre ou est lu : choix OAuth
 * (les autres ne s'affichent même pas), connexion par jeton système, création
 * ou modification d'une fiche, synchro.
 */

type Env = Record<string, string | undefined>;

export const ALLOWLIST_VAR = "META_ALLOWED_AD_ACCOUNTS";

/** « act_1, act_2 » → { act_1, act_2 }. Un identifiant sans « act_ » est normalisé. */
export function allowedAccounts(env: Env = process.env): Set<string> {
  return new Set(
    (env[ALLOWLIST_VAR] ?? "")
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.startsWith("act_") ? s : `act_${s}`)),
  );
}

export function isAllowedAccount(externalId: string | null | undefined, env: Env = process.env): boolean {
  if (!externalId) return false;
  if (externalId === MOCK_ACCOUNT_ID) return env.ADS_META_MOCK === "1";
  return allowedAccounts(env).has(externalId);
}

/** Le refus, en une phrase qui dit quoi faire. */
export function refusal(externalId: string | null | undefined, env: Env = process.env): string {
  const list = allowedAccounts(env);
  return list.size
    ? `Compte ${externalId ?? "?"} refusé : seuls ${[...list].join(", ")} peuvent être connectés (${ALLOWLIST_VAR}).`
    : `Compte ${externalId ?? "?"} refusé : aucune liste de comptes autorisés. Posez ${ALLOWLIST_VAR} (ex. act_211325410243618).`;
}
