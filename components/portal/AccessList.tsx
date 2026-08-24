"use client";

import { useEffect, useState } from "react";

import { IconCheck, IconCross, IconMail, IconPrinter, IconSpinner } from "@/components/ui/icons";

/**
 * « Mes accès TIM » — les utilisateurs, regroupés par profil.
 *
 * Les vignettes en grille traitaient un administrateur et un compagnon comme
 * deux objets équivalents, dans l'ordre où la base les rendait. Or la hiérarchie
 * des profils est ce qui structure la distribution : on prévient l'admin, puis
 * les conducteurs, puis les chefs de chantier. D'où des sections plutôt qu'une
 * liste continue — avec quinze lignes d'affilée, il faut lire chaque intitulé
 * pour savoir où l'on en est.
 *
 * Deux gestes par ligne, parce que les deux situations existent :
 *  - IMPRIMER, pour la remise en main propre — beaucoup de compagnons n'ont pas
 *    d'adresse professionnelle, et un papier tendu en réunion de chantier arrive
 *    à destination ;
 *  - ENVOYER, pour ceux qui sont en déplacement. L'envoi part de TIM, vers
 *    l'adresse déclarée pour la personne, jamais vers une autre.
 */

export type Access = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  profileLabel?: string | null;
  email?: string | null;
  password?: string | null;
};

export type Group = { label: string; accesses: Access[] };

type Sent = { state: "sending" } | { state: "ok"; to: string } | { state: "ko"; message: string };

const fullName = (a: Access) =>
  [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || "Utilisateur";

export default function AccessList({ groups }: { groups: Group[] }) {
  const [sent, setSent] = useState<Record<string, Sent>>({});

  /**
   * Impression en cours. `null` = aucune ; `{ id: null }` = toute la liste ;
   * `{ id: "12" }` = cette fiche seule.
   *
   * Un état plutôt qu'une manipulation du DOM : la ligne visée doit porter sa
   * classe AVANT que le navigateur n'ouvre l'aperçu, or React ne l'aura posée
   * qu'au rendu suivant. L'impression part donc d'un effet, une fois l'écran à
   * jour.
   *
   * Les DEUX boutons passent par cet état, y compris « imprimer tout » : sans
   * ça, une impression globale juste après une impression unitaire aurait gardé
   * la liste en mode « une seule fiche ».
   */
  const [printing, setPrinting] = useState<{ id: string | null } | null>(null);

  useEffect(() => {
    if (!printing) return;

    // Remise à zéro à la FERMETURE de l'aperçu, et à rien d'autre.
    //
    // Un délai de repli, ici, est un piège : Chrome tient l'aperçu ouvert aussi
    // longtemps qu'il le faut ET répercute les changements du DOM en direct.
    // Retirer la classe au bout de quelques secondes faisait donc réapparaître
    // toutes les lignes dans l'aperçu déjà affiché — l'impression unitaire
    // rendait la page entière. Si `afterprint` n'est jamais émis, l'état reste
    // posé sans conséquence visible : ces classes ne servent qu'à l'impression.
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done, { once: true });

    window.print();

    return () => window.removeEventListener("afterprint", done);
  }, [printing]);

  const sendOne = async (a: Access) => {
    const key = String(a.id);
    setSent((s) => ({ ...s, [key]: { state: "sending" } }));
    try {
      const res = await fetch("/api/portal/acces", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id }),
      });
      const body = (await res.json().catch(() => null)) as { to?: string; error?: string } | null;

      if (!res.ok) {
        // Chaque refus a sa raison, et elles n'appellent pas la même réaction :
        // une adresse manquante se corrige dans le dossier, un envoi raté se
        // retente. Un « une erreur est survenue » unique les confondrait.
        const message =
          body?.error === "no_email"
            ? "Aucune adresse e-mail pour cette personne. Ajoutez-la dans votre dossier."
            : body?.error === "no_access"
              ? "Ses accès ne sont pas encore générés."
              : "L'envoi a échoué. Réessayez dans un instant.";
        setSent((s) => ({ ...s, [key]: { state: "ko", message } }));
        return;
      }
      setSent((s) => ({ ...s, [key]: { state: "ok", to: body?.to ?? a.email ?? "" } }));
    } catch {
      setSent((s) => ({
        ...s,
        [key]: { state: "ko", message: "L'envoi a échoué. Réessayez dans un instant." },
      }));
    }
  };

  const row = (a: Access) => {
    const key = String(a.id);
    const status = sent[key];
    return (
      <li
        key={key}
        className={`acces-ligne flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3${
          printing?.id === key ? " acces-ligne--solo" : ""
        }`}
      >
        {/* Largeurs FIXES et non proportionnelles : c'est ce qui aligne les
            colonnes d'une ligne à l'autre, et surtout d'une section à l'autre.
            Avec un nom élastique, « Identifiant » se décalait de trois
            centimètres entre « Charlie Piancatelli » et « Thomas Piancatelli »,
            et l'œil ne pouvait plus descendre la colonne d'un trait. */}
        <span className="w-44 shrink-0 font-semibold text-foreground">{fullName(a)}</span>

        <dl className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted">Identifiant</dt>
            {/* L'adresse ne se coupe pas : un identifiant réparti sur deux
                lignes se recopie de travers, et c'est précisément ce qu'on vient
                lire. La colonne s'élargit, ou la page défile — jamais l'adresse
                qui se scinde. */}
            <dd className="font-mono whitespace-nowrap text-foreground">{a.email ?? "—"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted">Mot de passe</dt>
            <dd className="font-mono whitespace-nowrap text-foreground">{a.password}</dd>
          </div>
        </dl>

        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => setPrinting({ id: key })}
            title={`Imprimer la fiche de ${fullName(a)}`}
            aria-label={`Imprimer la fiche de ${fullName(a)}`}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-primary hover:text-primary"
          >
            <IconPrinter className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => void sendOne(a)}
            disabled={status?.state === "sending" || !a.email}
            title={
              a.email
                ? `Envoyer ses accès à ${a.email}`
                : "Aucune adresse e-mail pour cette personne"
            }
            aria-label={`Envoyer ses accès par e-mail à ${fullName(a)}`}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status?.state === "sending" ? (
              <IconSpinner className="h-4 w-4 animate-spin" />
            ) : status?.state === "ok" ? (
              <IconCheck className="h-4 w-4 text-success-text" />
            ) : status?.state === "ko" ? (
              <IconCross className="h-4 w-4 text-danger-text" />
            ) : (
              <IconMail className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Le résultat sous la ligne concernée, pas dans un bandeau global :
            avec dix utilisateurs, « envoyé » en haut de page ne dit pas à qui. */}
        {status && status.state !== "sending" && (
          <p
            className={`w-full text-sm print:hidden ${
              status.state === "ok" ? "text-success-text" : "text-danger-text"
            }`}
            role="status"
          >
            {status.state === "ok" ? `Accès envoyés à ${status.to}.` : status.message}
          </p>
        )}
      </li>
    );
  };

  const total = groups.reduce((n, g) => n + g.accesses.length, 0);

  return (
    // Le TABLEAU est borné et centré, pas la page : une ligne tient en trois
    // colonnes courtes, et l'étirer sur un grand écran mettrait vingt
    // centimètres de vide entre le nom et son mot de passe — c'est justement
    // l'association des deux qu'on vient lire. Le reste de l'écran (titre,
    // avertissement) garde la largeur de l'espace client.
    <div className={`mx-auto max-w-3xl${printing?.id ? " acces--solo" : ""}`}>
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => setPrinting({ id: null })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <IconPrinter className="h-4 w-4" />
          Imprimer les {total} fiches
        </button>
        <span className="text-sm text-muted">ou une seule, avec l&apos;icône de sa ligne.</span>
      </div>

      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.label}>
            <h2 className="acces-groupe__titre mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              {g.label}
              <span className="ml-2 font-normal normal-case">
                · {g.accesses.length} {g.accesses.length > 1 ? "personnes" : "personne"}
              </span>
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-white">
              {g.accesses.map(row)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
