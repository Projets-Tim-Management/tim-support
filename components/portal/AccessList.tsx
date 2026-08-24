"use client";

import { useEffect, useState } from "react";

import { IconCheck, IconCross, IconMail, IconPrinter, IconSpinner } from "@/components/ui/icons";

/**
 * « Mes accès TIM » — une ligne par utilisateur, dans l'ordre des profils.
 *
 * Les vignettes en grille traitaient un administrateur et un compagnon comme
 * deux objets équivalents, alors que la hiérarchie des profils est précisément
 * ce qui aide à distribuer : on descend la liste dans l'ordre où l'on prévient
 * les gens. D'où une liste ordonnée, et le tri fait côté serveur.
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

type Sent = { state: "sending" } | { state: "ok"; to: string } | { state: "ko"; message: string };

const fullName = (a: Access) =>
  [a.firstName, a.lastName].filter(Boolean).join(" ").trim() || "Utilisateur";

export default function AccessList({ accesses }: { accesses: Access[] }) {
  const [sent, setSent] = useState<Record<string, Sent>>({});

  /**
   * Fiche à imprimer seule. `null` = toutes.
   *
   * Un état plutôt qu'une manipulation du DOM : la ligne visée doit porter sa
   * classe AVANT que le navigateur n'ouvre l'aperçu, or React ne l'aura posée
   * qu'au rendu suivant. On déclenche donc l'impression dans un effet, une fois
   * l'écran à jour.
   */
  const [solo, setSolo] = useState<string | null>(null);

  useEffect(() => {
    if (solo === null) return;

    window.print();

    // Retour à l'état normal une fois l'aperçu refermé. Le délai de repli existe
    // parce que `afterprint` n'est pas émis partout (Safari) : une page qui
    // resterait amputée de ses lignes serait pire que pas de bouton du tout.
    const restore = () => setSolo(null);
    window.addEventListener("afterprint", restore, { once: true });
    const timer = window.setTimeout(restore, 3000);

    return () => {
      window.removeEventListener("afterprint", restore);
      window.clearTimeout(timer);
    };
  }, [solo]);

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
      const body = (await res.json().catch(() => null)) as
        | { to?: string; error?: string }
        | null;

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

  return (
    <>
      {/* Barre d'actions : imprimer TOUT reste le geste principal — on prépare
          la distribution d'un coup, puis on découpe. */}
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          <IconPrinter className="h-4 w-4" />
          Imprimer toutes les fiches
        </button>
        <span className="text-sm text-muted">
          ou imprimez une fiche à la fois avec l&apos;icône de chaque ligne.
        </span>
      </div>

      <ul
        className={`divide-y divide-border rounded-lg border border-border bg-white${
          solo ? " acces--solo" : ""
        }`}
      >
        {accesses.map((a) => {
          const key = String(a.id);
          const status = sent[key];
          return (
            <li
              key={key}
              className={`acces-ligne flex flex-wrap items-center gap-x-6 gap-y-2 p-4${
                solo === key ? " acces-ligne--solo" : ""
              }`}
            >
              <div className="min-w-[12rem] flex-1">
                <p className="font-semibold text-foreground">{fullName(a)}</p>
                {a.profileLabel && <p className="text-xs text-muted">{a.profileLabel}</p>}
              </div>

              <dl className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted">Identifiant</dt>
                  <dd className="break-all font-mono text-foreground">{a.email ?? "—"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-28 shrink-0 text-muted">Mot de passe</dt>
                  <dd className="font-mono text-foreground">{a.password}</dd>
                </div>
              </dl>

              <div className="flex items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => setSolo(key)}
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
        })}
      </ul>
    </>
  );
}
