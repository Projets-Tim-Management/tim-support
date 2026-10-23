import type { AdminViewServerProps } from "payload";

import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";

import { hasAdminRole } from "@/core/access";
import MassEmailScreen from "@/modules/marketing/admin/MassEmailScreen";
import { massEmailContext } from "@/modules/marketing/lib/mass-email-server";

/**
 * Écran « E-mail de masse » (/admin/emails-de-masse, menu Marketing).
 *
 * Un même message à une liste d'adresses, signé de l'admin connecté, parti de
 * son adresse — mais UN e-mail par adresse : personne ne voit les autres
 * destinataires. Des modèles servent de point de départ (la présentation de la
 * V2 en premier). Réservé aux administrateurs.
 */
export default async function MassEmailView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req } = initPageResult;
  const { payload, user } = req;
  const isAdmin = hasAdminRole(user);
  // Lu ici, au rendu : l'écran s'ouvre complet, modèle choisi et expéditeur vérifié.
  const context = isAdmin && user ? await massEmailContext(payload, user as never) : null;

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={user ?? undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <header className="mass-mail__head">
          <h1 className="mass-mail__title">E-mail de masse</h1>
          <p className="mass-mail__sub">
            Un même message à plusieurs personnes, signé de votre nom et parti de votre adresse. Chaque adresse reçoit
            son propre e-mail : aucun destinataire ne voit les autres.
          </p>
        </header>
        {context ? (
          <MassEmailScreen
            initialTemplates={context.templates}
            directory={context.directory}
            senders={context.senders}
            defaultSender={context.defaultSender}
            hasSignature={context.hasSignature}
          />
        ) : (
          <p className="mass-mail__hint">Cet écran est réservé aux administrateurs.</p>
        )}
      </Gutter>
    </DefaultTemplate>
  );
}
