"use client";

import { useSearchParams } from "next/navigation";

import "./connect-mailbox.scss";

/**
 * En-tête de la liste des boîtes mail : le bouton de connexion, et ce qu'on
 * s'engage à faire de ce qu'on lit.
 *
 * Le texte n'est pas une précaution juridique posée là par habitude. On demande
 * à quelqu'un d'ouvrir sa boîte : il doit lire, au moment de cliquer, ce qui
 * sera conservé et ce qui ne le sera pas. Le mettre dans une page d'aide que
 * personne n'ouvre reviendrait à ne pas le dire.
 */

const MESSAGES: Record<string, { tone: "ok" | "ko"; text: string }> = {
  connectee: { tone: "ok", text: "Boîte connectée. La première lecture aura lieu au prochain passage." },
  annule: { tone: "ko", text: "Connexion annulée — vous n'avez rien autorisé." },
  etat_invalide: { tone: "ko", text: "Le lien de retour a expiré. Relancez la connexion." },
  compte_inconnu: { tone: "ko", text: "Google n'a pas renvoyé l'adresse du compte. Réessayez." },
  sans_jeton_durable: {
    tone: "ko",
    text:
      "Google n'a pas délivré d'autorisation durable — la connexion serait morte en une heure. " +
      "Retirez l'accès de « TIM Support — boîtes mail » dans votre compte Google, puis reconnectez.",
  },
  echec: { tone: "ko", text: "La connexion a échoué. Le détail est dans le journal." },
};

export const ConnectMailbox: React.FC = () => {
  const params = useSearchParams();
  const result = MESSAGES[params?.get("mailbox") ?? ""];

  return (
    <div className="mailbox-intro">
      {result ? <p className={`mailbox-intro__flash is-${result.tone}`}>{result.text}</p> : null}

      <div className="mailbox-intro__box">
        <div className="mailbox-intro__text">
          <p className="mailbox-intro__title">Faire remonter vos échanges dans les fiches</p>
          <p>
            Les e-mails échangés avec un prospect apparaissent dans l&apos;historique de son
            opportunité, sans rien avoir à faire — ni copie cachée, ni ressaisie.
          </p>
          <p className="mailbox-intro__rule">
            <strong>Ce qui est conservé :</strong> uniquement les messages dont l&apos;une des
            adresses correspond à une opportunité déjà enregistrée. Tout le reste de votre boîte est
            comparé puis oublié — ni l&apos;objet, ni le contenu, ni l&apos;expéditeur n&apos;en sont
            gardés. Des pièces jointes, seul le nom est retenu ; les fichiers ne sont pas copiés.
            L&apos;accès demandé est en <strong>lecture seule</strong> : rien n&apos;est écrit,
            déplacé ni supprimé dans votre boîte. Vous pouvez le retirer à tout moment depuis votre
            compte Google.
          </p>
        </div>
        <a className="mailbox-intro__btn" href="/api/mailbox/connect">
          Connecter ma boîte mail
        </a>
      </div>
    </div>
  );
};

export default ConnectMailbox;
