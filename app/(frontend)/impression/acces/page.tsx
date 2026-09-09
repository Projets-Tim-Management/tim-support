import { headers } from "next/headers";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { readTimAccesses } from "@/modules/marketing/lib/credential-secrets";
import { LICENCE_PROFILE_OPTIONS } from "@/modules/marketing/lib/onboarding";

import PrintNow from "./PrintNow";

/**
 * Feuille d'accès à IMPRIMER, ouverte depuis le back-office.
 *
 * Pourquoi une page à part plutôt qu'un `window.print()` sur la console : le
 * back-office imprimé sort avec son menu, ses onglets et ses tableaux de
 * saisie. Ici, la page ne contient QUE ce qu'on veut sur le papier, et elle
 * hérite au passage des styles du site (le back-office, lui, ne charge pas
 * Tailwind).
 *
 * Réservée aux admins : elle affiche des mots de passe en clair. La vérification
 * porte sur la session Payload, pas sur un paramètre d'URL — un lien partagé ne
 * montre donc rien à qui n'est pas connecté.
 *
 * `?id=` limite la feuille à une personne : c'est l'impression unitaire.
 */
export const dynamic = "force-dynamic";

type Search = { clientId?: string; id?: string };

const label = (key?: string | null) =>
  LICENCE_PROFILE_OPTIONS.find((p) => p.value === key)?.label ?? "Profil non précisé";

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const { clientId, id } = await searchParams;
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: await headers() });

  if (!hasAdminRole(user)) {
    return <p className="p-10 text-muted">Accès réservé à l&apos;équipe TIM.</p>;
  }
  if (!clientId) {
    return <p className="p-10 text-muted">Aucune entreprise indiquée.</p>;
  }

  const client = (await payload
    .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { companyName?: string | null } | null;

  // Déjà rangés par niveau puis par nom (`readTimAccesses`) : la feuille se
  // relit ligne à ligne à côté de l'espace client, qui montre le même ordre.
  const acces = (await readTimAccesses(payload, clientId))
    .filter((a) => a.timPassword)
    .filter((a) => (id ? String(a.id) === String(id) : true));

  /**
   * Regroupées par profil, comme dans l'espace client.
   *
   * Une suite de quinze fiches oblige à lire chaque intitulé pour savoir où l'on
   * en est ; et c'est par niveau qu'on distribue — l'administrateur d'abord,
   * puis les conducteurs, puis le terrain. Le tri les a déjà rassemblées : le
   * dernier groupe est forcément le bon.
   */
  const groupes: { label: string; gens: typeof acces }[] = [];
  for (const a of acces) {
    const titre = label(a.licenceProfile);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.label === titre) dernier.gens.push(a);
    else groupes.push({ label: titre, gens: [a] });
  }

  return (
    <div className="px-8 py-10 print:px-0 print:py-0">
      <PrintNow />

      <header className="mb-8 print:mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Accès au logiciel TIM{client?.companyName ? ` — ${client.companyName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {acces.length} accès · à remettre en main propre. Ces mots de passe sont personnels.
        </p>
      </header>

      {acces.length === 0 ? (
        <p className="text-muted">Aucun accès généré pour cette entreprise.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groupes.map((groupe) => (
            <div key={groupe.label} className="flex flex-col gap-3">
              {/* L'intitulé ne se répète pas sur chaque fiche quand il coiffe le
                  groupe — sauf en impression unitaire, où il n'y a rien à
                  coiffer et où la fiche doit se suffire à elle-même. */}
              {id ? null : (
                <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {groupe.label}
                </h2>
              )}
              {groupe.gens.map((a) => (
                /* `break-inside-avoid` : une fiche coupée en deux par un saut de
                   page se recopie de travers, ou se perd. */
                <section
                  key={String(a.id)}
                  className="break-inside-avoid rounded-lg border border-border p-4"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-base font-semibold text-foreground">
                      {[a.firstName, a.lastName].filter(Boolean).join(" ") || a.email}
                    </span>
                    <span className="text-sm text-muted">{label(a.licenceProfile)}</span>
                  </div>
                  <dl className="mt-3 flex flex-col gap-1 text-sm">
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted">Identifiant</dt>
                      <dd className="font-mono whitespace-nowrap text-foreground">
                        {a.email ?? "—"}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted">Mot de passe</dt>
                      <dd className="font-mono whitespace-nowrap text-foreground">
                        {a.timPassword}
                      </dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
