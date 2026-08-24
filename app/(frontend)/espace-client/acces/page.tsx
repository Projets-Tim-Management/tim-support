import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import AccessList, { type Access } from "@/components/portal/AccessList";
import { payloadClient } from "@/core/payload-client";
import { readTimAccesses } from "@/modules/marketing/lib/credential-secrets";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { LICENCE_PROFILE_OPTIONS } from "@/modules/marketing/lib/onboarding";

export const metadata: Metadata = {
  title: "Mes accès TIM",
  robots: { index: false, follow: false },
};

const PROFILE_LABEL: Record<string, string> = Object.fromEntries(
  LICENCE_PROFILE_OPTIONS.map((p) => [p.value, p.label]),
);

/**
 * Rang d'un profil dans la hiérarchie — l'ordre de la grille tarifaire
 * (administrateur, conducteur, chef de chantier, chef d'équipe, compagnon).
 *
 * C'est l'ordre dans lequel on prévient les gens : l'administrateur d'abord,
 * parce que c'est lui qui paramètre et qui répondra aux questions des autres.
 * Un profil inconnu — ou absent — passe en fin de liste plutôt que de fausser
 * le classement.
 */
const PROFILE_RANK = new Map<string, number>(
  LICENCE_PROFILE_OPTIONS.map((p, i) => [p.value as string, i]),
);
const rank = (profile?: string | null): number =>
  PROFILE_RANK.get(profile ?? "") ?? LICENCE_PROFILE_OPTIONS.length;

type Credential = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  licenceProfile?: string | null;
  timPassword?: string | null;
  email?: string | null;
};

/**
 * « Mes accès » — la liste des utilisateurs, dans l'ordre des profils.
 *
 * C'est le client qui distribue les accès à ses équipes, et il le fait de deux
 * façons selon la personne : sur papier pour ceux qu'il voit (beaucoup de
 * compagnons n'ont pas d'adresse professionnelle, un papier tendu en réunion de
 * chantier arrive à destination), par e-mail pour ceux qui sont en déplacement.
 * Les deux gestes sont donc offerts sur chaque ligne, et pour toute la liste.
 *
 * La lecture est filtrée sur l'entreprise du cookie signé, jamais sur un
 * identifiant venu de l'URL. Les mots de passe sont chiffrés au repos et
 * masqués par l'API : ils ne sont déchiffrés qu'ici, derrière une session.
 */
export default async function AccesPage() {
  const ctx = await getPortalClient();
  if (!ctx) redirect("/espace-client");

  const payload = await payloadClient();
  // Lecture déchiffrée : les mots de passe sont chiffrés au repos et masqués par
  // l'API. Ici le client est déjà authentifié (code à usage unique) et vient
  // chercher précisément ce qu'il doit distribuer à ses équipes.
  // Les accès vivent désormais sur les UTILISATEURS déclarés : les comptes sont
  // créés dans TIM, on ne conserve ici que ce qui se distribue aux équipes.
  const credentials = ((await readTimAccesses(payload, ctx.client.id)) as Credential[])
    .filter((c) => c.timPassword)
    // Par profil, puis par nom : deux chefs de chantier se suivent dans l'ordre
    // de l'annuaire, ce qui aide à cocher une liste papier.
    .sort(
      (a, b) =>
        rank(a.licenceProfile) - rank(b.licenceProfile) ||
        (a.lastName ?? "").localeCompare(b.lastName ?? "", "fr") ||
        (a.firstName ?? "").localeCompare(b.firstName ?? "", "fr"),
    );

  const accesses: Access[] = credentials.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    profileLabel: c.licenceProfile ? (PROFILE_LABEL[c.licenceProfile] ?? c.licenceProfile) : null,
    email: c.email,
    password: c.timPassword,
  }));

  return (
    <div className="px-6 py-10 sm:px-8">
      <div className="mb-8 flex items-start justify-between gap-4 print:hidden">
        <div>
          <Link href="/espace-client/accueil" className="text-sm text-muted hover:underline">
            ← Mon espace
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Mes accès TIM</h1>
          <p className="mt-2 text-muted">
            {accesses.length} accès, dans l&apos;ordre des profils. Imprimez-les tous d&apos;un coup,
            ou fiche par fiche — et envoyez les siens à quelqu&apos;un qui n&apos;est pas sur place.
          </p>
        </div>
      </div>

      <p className="mb-6 rounded-md bg-processing-bg px-4 py-3 text-sm text-processing-text print:hidden">
        Ces identifiants sont confidentiels et ne s&apos;affichent qu&apos;ici, une fois connecté.
        L&apos;envoi par e-mail part de TIM et va&nbsp;toujours à l&apos;adresse déclarée pour la
        personne concernée&nbsp;: vérifiez-la avant d&apos;envoyer.
      </p>

      {accesses.length === 0 ? (
        <p className="text-muted">
          Vos accès ne sont pas encore prêts. Nous vous prévenons dès qu&apos;ils le sont.
        </p>
      ) : (
        <AccessList accesses={accesses} />
      )}

    </div>
  );
}
