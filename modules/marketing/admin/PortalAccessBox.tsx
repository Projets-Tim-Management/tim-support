"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * État de l'espace client, en haut de l'onglet.
 *
 * Le tableau en dessous montre une ligne d'accès ; il ne dit pas ce qu'on veut
 * savoir : est-ce que le client a reçu son lien ? La question s'est posée pour
 * de vrai, sans réponse — l'accès existait, l'invitation n'était jamais partie,
 * et rien à l'écran ne permettait de faire la différence.
 *
 * Trois états, et un seul bouton dont le sens change avec l'état :
 *  - aucun accès          → rien à faire ici, l'espace s'ouvre au Go de TIM ;
 *  - accès en attente     → « Ouvrir l'espace maintenant » (secours, avant le Go) ;
 *  - accès ouvert         → « Renvoyer l'invitation », avec la date du dernier envoi.
 */

type State = {
  hasAccount: boolean;
  email: string | null;
  active: boolean;
  lastLoginAt: string | null;
  invitationSentAt: string | null;
  hasRun: boolean;
};

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

export function PortalAccessBox() {
  const { id } = useDocumentInfo();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/portal-invite?clientId=${id}`, {
        credentials: "include",
      });
      setState(res.ok ? await res.json() : null);
    } catch {
      setState(null);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/admin/portal-invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id }),
      });
      const body = (await res.json().catch(() => null)) as
        | { opened?: boolean; resent?: boolean; error?: string }
        | null;

      if (!res.ok) {
        setError(
          body?.error === "no_run"
            ? "Aucune phase de test ouverte : l'invitation ne peut pas être composée."
            : body?.error === "no_recipient"
              ? "Aucune adresse sur l'accès."
              : "L'envoi a échoué. Réessayez.",
        );
        return;
      }
      setDone(body?.opened ? "Espace ouvert, invitation envoyée." : "Invitation renvoyée.");
      await load();
    } catch {
      setError("L'envoi a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  if (!id || !state) return null;

  if (!state.hasAccount) {
    return (
      <div className="jr-gen">
        <p className="jr-gen__line">
          <strong>Aucun accès</strong> pour ce client.
        </p>
        <p className="jr-gen__hint">
          L&apos;adresse s&apos;enregistre au démarrage de la phase de test, et l&apos;espace
          s&apos;ouvre à la validation du Go / No-Go. Rien à créer ici.
        </p>
      </div>
    );
  }

  const sent = fmt(state.invitationSentAt);

  return (
    <div className="jr-gen">
      <p className="jr-gen__line">
        {state.active ? (
          <>
            <span className="jr-gen__ok">Espace ouvert</span> pour <strong>{state.email}</strong>
          </>
        ) : (
          <>
            <span className="jr-gen__warn">En attente du Go</span> — adresse enregistrée&nbsp;:{" "}
            <strong>{state.email}</strong>
          </>
        )}
        {" · "}
        {sent ? (
          <>Invitation envoyée le {sent}</>
        ) : (
          <span className="jr-gen__warn">invitation jamais envoyée</span>
        )}
        {state.lastLoginAt && <> · dernière connexion le {fmt(state.lastLoginAt)}</>}
      </p>

      <p className="jr-gen__hint">
        {state.active
          ? "Le client reçoit un lien vers son espace ; il s'y connecte avec cette adresse et un code à 6 chiffres, sans mot de passe. Renvoyez l'invitation s'il ne l'a pas reçue, l'a perdue, ou si vous venez de corriger l'adresse."
          : "L'espace s'ouvrira tout seul à la validation du Go / No-Go, et l'invitation partira à ce moment-là. Ce bouton n'est là que pour l'ouvrir avant, en secours."}
      </p>

      <button type="button" className="jr-btn" disabled={busy} onClick={() => void act()}>
        {busy
          ? "Envoi…"
          : state.active
            ? "Renvoyer l'invitation"
            : "Ouvrir l'espace maintenant"}
      </button>

      {done && <p className="jr-gen__done">{done}</p>}
      {error && <p className="jr-gen__ko">{error}</p>}
    </div>
  );
}
