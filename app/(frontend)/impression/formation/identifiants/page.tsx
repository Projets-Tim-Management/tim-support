import { headers } from "next/headers";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { loadTrainingPrint } from "@/modules/training/lib/print-data";
import { CredentialsTable } from "@/modules/training/print/CredentialsTable";

import PrintNow from "../../acces/PrintNow";

/**
 * Les identifiants de TOUTES les personnes formées, sur une feuille A4 : un
 * tableau groupé par profil (nom, identifiant, mot de passe) et une colonne
 * « Remis » à cocher au stylo quand on tend le papier ou l'étiquette.
 *
 * C'est la feuille du formateur : elle se garde, elle ne se distribue pas.
 * TIM seulement — elle porte les mots de passe en clair.
 */
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ training?: string; scope?: string }> }) {
  // `scope=tous` : tous les contacts du client, pas seulement les personnes formées.
  const { training, scope } = await searchParams;
  const all = scope === "tous";
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: await headers() });
  if (!hasAdminRole(user)) return <p className="p-10 text-muted">Accès réservé à l&apos;équipe TIM (mots de passe).</p>;
  if (!training) return <p className="p-10 text-muted">Aucune formation indiquée.</p>;
  const data = await loadTrainingPrint(payload, training, { withPasswords: true, allContacts: all });
  if (!data) return <p className="p-10 text-muted">Formation introuvable.</p>;

  const people = data.people;

  return (
    <div className="px-8 py-10 text-foreground print:px-0 print:py-0">
      <PrintNow />
      {/* Pas de <header> : la feuille d'impression du site les masque tous. */}
      <div className="mb-5">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Formation TIM · identifiants</p>
        <h1 className="mt-1 text-xl font-bold">{data.companyName || "Identifiants"}</h1>
        <p className="mt-1 text-sm text-muted">
          {people.length} {all ? `utilisateur${people.length > 1 ? "s" : ""} du client` : `personne${people.length > 1 ? "s" : ""} formée${people.length > 1 ? "s" : ""}`}.
          Document confidentiel : à garder par le formateur, pas à distribuer.
        </p>
      </div>

      <CredentialsTable people={data.people} />
    </div>
  );
}
