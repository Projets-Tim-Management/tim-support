import type { CollectionAfterDeleteHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { revokeGoogleToken } from "@/core/lib/google-oauth";

/**
 * Les boîtes mail connectées — une par personne.
 *
 * Ce que la connexion autorise, et rien de plus : LIRE. Le scope demandé est
 * `gmail.readonly`, et le logiciel n'a aucune raison d'écrire, d'archiver ou de
 * supprimer dans la boîte de quelqu'un.
 *
 * Ce qui est conservé de ce qu'on lit tient en une règle : un message n'est
 * écrit sur une fiche que si l'une de ses adresses correspond à une opportunité
 * déjà connue. Le reste est comparé puis oublié — jamais stocké, pas même son
 * objet. C'est ce qui rend la connexion proportionnée à sa finalité, et c'est
 * ce qu'il faut pouvoir dire à quelqu'un à qui on demande d'ouvrir sa boîte.
 *
 * ⚠️ Cette table porte des jetons d'accès à une boîte mail. Une fuite ici ne
 * vaut pas une fuite de mots de passe — elle vaut mieux, ou pire, selon le sens
 * où on la prend : le jeton donne accès à TOUT le contenu de la boîte, bien
 * au-delà de ce que le logiciel en retient.
 */
/**
 * Déconnecter coupe des DEUX côtés.
 *
 * Supprimer la ligne efface nos jetons ; sans révocation, l'application reste
 * inscrite dans le compte Google de la personne, qui continue d'y lire que nous
 * avons accès à sa messagerie. Ce serait faux, et c'est précisément le genre de
 * détail qui ruine la confiance qu'on demande en branchant une boîte.
 *
 * Les échanges déjà rattachés, eux, RESTENT : ils appartiennent à l'historique
 * des opportunités, pas à la boîte qui les a fournis. Les effacer se demande
 * explicitement — voir `--purger` dans scripts/mailbox-status.ts.
 */
const revokeOnDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const token = (doc as { refreshToken?: string }).refreshToken;
  const email = (doc as { accountEmail?: string }).accountEmail;
  if (!token) return doc;

  const done = await revokeGoogleToken(token);
  req.payload.logger.info(
    done
      ? `[boîte mail] ${email} déconnectée, autorisation révoquée chez Google.`
      : `[boîte mail] ${email} déconnectée ; la révocation chez Google a échoué (peut-être déjà faite).`,
  );
  return doc;
};

export const MailboxConnections: CollectionConfig = {
  slug: "mailbox-connections",
  labels: { singular: "Boîte mail", plural: "Boîtes mail connectées" },
  admin: {
    useAsTitle: "accountEmail",
    defaultColumns: ["accountEmail", "status", "lastSyncAt", "capturedCount"],
    group: "Partenaires",
    description:
      "Les boîtes dont les échanges remontent dans l'historique des opportunités. Seuls les messages concernant un prospect connu sont conservés. Supprimer une ligne révoque l'accès chez Google et arrête la lecture ; les échanges déjà rattachés restent sur les fiches.",
    components: {
      beforeList: ["/modules/partner/admin/ConnectMailbox#ConnectMailbox"],
    },
  },
  // Créée et mise à jour par le flux OAuth uniquement : une connexion saisie à
  // la main n'aurait ni jeton valide ni consentement derrière elle.
  access: { read: isAdmin, create: () => false, update: isAdmin, delete: isAdmin },
  hooks: { afterDelete: [revokeOnDelete] },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "accountEmail",
          type: "email",
          label: "Compte connecté",
          required: true,
          unique: true,
          index: true,
          admin: { width: "50%", readOnly: true },
        },
        {
          name: "user",
          type: "relationship",
          relationTo: "users",
          label: "Connectée par",
          admin: { width: "50%", readOnly: true },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "provider",
          type: "select",
          label: "Fournisseur",
          required: true,
          defaultValue: "google",
          options: [{ label: "Google", value: "google" }],
          admin: { width: "34%", readOnly: true },
        },
        {
          /**
           * « En erreur » n'est pas « déconnectée » : un jeton révoqué depuis le
           * compte Google, un mot de passe changé, et la synchronisation
           * s'arrête. Sans cet état visible, elle cesserait simplement de
           * remonter des échanges, ce que personne ne remarque.
           */
          name: "status",
          type: "select",
          label: "État",
          required: true,
          defaultValue: "active",
          options: [
            { label: "Active", value: "active" },
            { label: "En erreur", value: "erreur" },
            { label: "Suspendue", value: "suspendue" },
          ],
          index: true,
          admin: {
            width: "33%",
            description: "« Suspendue » arrête la lecture sans couper la connexion.",
          },
        },
        {
          name: "lastSyncAt",
          type: "date",
          label: "Dernière lecture",
          admin: {
            width: "33%",
            readOnly: true,
            date: { displayFormat: "dd/MM/yyyy HH:mm" },
          },
        },
      ],
    },
    {
      name: "lastError",
      type: "text",
      label: "Dernière erreur",
      admin: {
        readOnly: true,
        condition: (data) => Boolean(data?.lastError),
        description: "Ce que Google a répondu. Une reconnexion suffit le plus souvent.",
      },
    },
    {
      /**
       * Jusqu'où remonter à la PREMIÈRE lecture.
       *
       * Posée à la connexion et jamais recalculée : c'est elle qui décide du
       * volume du premier passage, et la déplacer après coup relirait des mois
       * de messages pour rien.
       */
      name: "syncSince",
      type: "date",
      label: "Reprise depuis",
      admin: {
        readOnly: true,
        date: { displayFormat: "dd/MM/yyyy" },
        description: "Les échanges antérieurs ne sont pas repris.",
      },
    },
    {
      name: "capturedCount",
      type: "number",
      label: "Échanges rattachés",
      defaultValue: 0,
      admin: { readOnly: true, description: "Depuis la connexion." },
    },

    // ── Jetons : jamais affichés, jamais modifiables à la main ───────────────
    { name: "accessToken", type: "text", admin: { hidden: true } },
    { name: "refreshToken", type: "text", admin: { hidden: true } },
    { name: "expiresAt", type: "date", admin: { hidden: true } },
    /**
     * Les DEUX curseurs de la lecture, et ils avancent en sens inverse.
     *
     * `syncedUpTo` : jusqu'où le présent est à jour. Chaque passage repart de
     * là — avec un jour de recouvrement, parce qu'un message peut arriver
     * pendant qu'on lit.
     *
     * `backfillBefore` : jusqu'où la reprise du passé est descendue. Elle
     * remonte le temps par tranches, de `backfillBefore` vers `syncSince`, et
     * s'arrête quand les deux se rejoignent.
     *
     * Deux curseurs plutôt que l'API `history` de Gmail : celle-ci ne remonte
     * qu'une semaine en arrière et ne sert donc à rien pour reprendre un an
     * d'historique. Des dates se lisent, se corrigent à la main, et survivent à
     * une reconnexion.
     */
    { name: "syncedUpTo", type: "date", admin: { hidden: true } },
    { name: "backfillBefore", type: "date", admin: { hidden: true } },
  ],
};
