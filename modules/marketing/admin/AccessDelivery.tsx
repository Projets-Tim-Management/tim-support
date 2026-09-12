"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Remettre les identifiants TIM depuis le back-office — tous, ou un par un.
 *
 * Le client peut déjà se les envoyer depuis son espace, mais c'est rarement lui
 * qui les demande : un référent rappelle, un prospect en essai n'a pas encore
 * ouvert son espace, une personne a perdu son message. On refait donc ici le
 * geste de l'espace client, à sa place.
 *
 * Deux formes, parce qu'on rencontre les deux : le RÉCAPITULATIF part à une
 * seule adresse — celle du référent par défaut, modifiable, parce que celui qui
 * distribue n'est pas toujours celui qui est déclaré ; l'envoi INDIVIDUEL part
 * toujours à l'adresse de la personne, jamais à une autre, pour qu'on ne puisse
 * pas se faire adresser le mot de passe d'un tiers.
 *
 * L'impression passe par une page dédiée plutôt que par cet écran : le
 * back-office s'imprime mal (menu, barres, tableaux qui débordent) et la feuille
 * remise en main propre doit tenir toute seule.
 *
 * Les mots de passe ne transitent pas par ici : l'écran sait seulement QUI a un
 * accès. Le déchiffrement reste côté serveur, dans l'envoi et l'impression.
 */

type Person = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  profileLabel?: string | null;
  hasAccess: boolean;
};

type Payload = { referent: string | null; people: Person[] };

const fullName = (p: Person) => [p.firstName, p.lastName].filter(Boolean).join(" ").trim();

const ICON_MAIL = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const ICON_PRINT = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 9V3h12v6" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="7" rx="1" />
  </svg>
);

export function AccessDelivery({ clientId, reloadToken }: { clientId: number | string; reloadToken?: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [to, setTo] = useState("");
  const [one, setOne] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/acces?clientId=${clientId}`, { credentials: "include" });
        if (!res.ok) throw new Error();
        const body = (await res.json()) as Payload;
        if (!alive) return;
        setData(body);
        // Prérempli, pas imposé : on remet souvent la liste à quelqu'un d'autre.
        setTo((current) => current || body.referent || "");
      } catch {
        if (alive) setData({ referent: null, people: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId, reloadToken]);

  const post = useCallback(
    async (key: string, body: Record<string, unknown>, ok: (to: string, count?: number) => string) => {
      setBusy(key);
      setDone(null);
      setError(null);
      try {
        const res = await fetch("/api/admin/acces", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, ...body }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { to?: string; count?: number; error?: string }
          | null;
        if (!res.ok) {
          setError(
            payload?.error === "no_access"
              ? "Aucun accès généré pour l'instant."
              : payload?.error === "no_email"
                ? "Cette personne n'a pas d'adresse e-mail."
                : payload?.error === "no_recipient"
                  ? "Indiquez une adresse de destination."
                  : "L'envoi a échoué. Réessayez.",
          );
          return;
        }
        setDone(ok(payload?.to ?? "", payload?.count));
      } catch {
        setError("L'envoi a échoué. Réessayez.");
      } finally {
        setBusy(null);
      }
    },
    [clientId],
  );

  const print = (id?: number | string) => {
    const url = `/impression/acces?clientId=${clientId}${id == null ? "" : `&id=${id}`}`;
    window.open(url, "_blank", "noopener");
  };

  if (!data) return <p className="jr-acc__wait">Chargement des accès…</p>;

  const ready = data.people.filter((p) => p.hasAccess);
  if (ready.length === 0) return null;

  const plural = ready.length > 1 ? "s" : "";

  return (
    <div className="jr-acc">
      <div className="jr-acc__bar">
        <p className="jr-acc__line">
          <strong>
            {ready.length} accès prêt{plural}
          </strong>
        </p>

        <input
          type="email"
          className="jr-acc__to"
          value={to}
          placeholder="destinataire@entreprise.fr"
          aria-label="Adresse de destination du récapitulatif"
          onChange={(e) => setTo(e.target.value)}
        />
        {/* Contour, pas plein : c'est un envoi qu'on fait une fois, à côté de
            l'adresse — en rouge plein il criait plus fort que le reste de la
            fiche. */}
        <button
          type="button"
          className="jr-btn jr-btn--small jr-btn--ghost"
          disabled={busy !== null || to.trim() === ""}
          onClick={() =>
            void post("all", { all: true, to: to.trim() }, (sent, count) =>
              `Récapitulatif de ${count ?? ready.length} accès envoyé à ${sent}.`,
            )
          }
        >
          {busy === "all" ? "Envoi…" : `Envoyer les ${ready.length} identifiants`}
        </button>
        <button type="button" className="jr-btn jr-btn--small jr-btn--quiet" onClick={() => print()}>
          {ICON_PRINT}
          Imprimer
        </button>
        <button
          type="button"
          className="jr-btn jr-btn--small jr-btn--quiet"
          aria-expanded={one}
          onClick={() => setOne((v) => !v)}
        >
          {one ? "Masquer le détail" : "Un par un"}
        </button>
      </div>

      {done ? <p className="jr-gen__done">{done}</p> : null}
      {error ? <p className="jr-gen__ko">{error}</p> : null}

      {one ? (
        <ul className="jr-acc__list">
          {ready.map((person) => (
            <li key={person.id} className="jr-acc__row">
              <span className="jr-acc__who">{fullName(person) || "Sans nom"}</span>
              <span className="jr-acc__mail">{person.email || "— pas d'adresse"}</span>
              {person.profileLabel ? (
                <span className="jr-acc__profile">{person.profileLabel}</span>
              ) : null}
              <button
                type="button"
                className="jr-btn jr-btn--small jr-btn--quiet"
                // Jamais d'adresse choisie ici : le serveur envoie à la sienne.
                disabled={busy !== null || !person.email}
                title={person.email ? `Envoyer à ${person.email}` : "Aucune adresse e-mail"}
                onClick={() =>
                  void post(`one-${person.id}`, { id: person.id }, (sent) => `Accès envoyés à ${sent}.`)
                }
              >
                {ICON_MAIL}
                {busy === `one-${person.id}` ? "Envoi…" : "Envoyer"}
              </button>
              <button
                type="button"
                className="jr-btn jr-btn--small jr-btn--quiet"
                onClick={() => print(person.id)}
              >
                {ICON_PRINT}
                Imprimer
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
