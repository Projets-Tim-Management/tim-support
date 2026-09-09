import { JOURNEY_EMAILS, type BuiltEmail } from "@/modules/marketing/lib/emails";

/**
 * L'invitation à l'espace client, envoyée HORS phase de test.
 *
 * Le même message que celui du parcours — on ne réécrit pas un second texte qui
 * dériverait du premier —, mais composé sans parcours : ni date de démarrage, ni
 * échéance de dossier, puisqu'il n'y en a pas. Le modèle sait déjà se passer de
 * ces dates (il garde alors une phrase générale plutôt que d'annoncer un délai
 * faux) : c'est ce qui rend l'envoi isolé possible sans rien inventer.
 *
 * Cet envoi existe parce qu'on ouvre parfois un espace à un prospect pour lui
 * faire essayer le produit, sans enclencher la séquence de quatre semaines. Un
 * seul message, à la demande, et rien derrière.
 */
export const INVITATION_KEY = "invitation-espace-client";

export const buildStandaloneInvitation = (args: {
  clientName?: string | null;
  contactFirstName?: string | null;
}): BuiltEmail | null => {
  const template = JOURNEY_EMAILS[INVITATION_KEY];
  if (!template) return null;
  return template({
    clientName: args.clientName ?? null,
    contactFirstName: args.contactFirstName ?? null,
  });
};
