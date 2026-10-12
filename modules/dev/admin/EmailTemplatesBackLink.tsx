import Link from "next/link";

/** En tête d'un modèle d'e-mail : le chemin du retour vers la liste. */
export const EmailTemplatesBackLink: React.FC = () => (
  <Link className="dev-mails-back" href="/admin/dev/modeles-email" prefetch={false}>
    ← Modèles d&apos;e-mail
  </Link>
);

export default EmailTemplatesBackLink;
