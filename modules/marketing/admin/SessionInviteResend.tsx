"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useState } from "react";

/**
 * Renvoi de la confirmation de session à tous les participants.
 *
 * Le partenaire anime la prise en main : c'est lui qui reçoit l'appel « je n'ai
 * rien reçu », la veille, et il n'avait aucun moyen d'y répondre — un événement
 * d'agenda ne se renvoie pas, et rien dans cette fiche ne relançait le message.
 *
 * Les destinataires sont affichés AVANT le clic : renvoyer un message sans
 * savoir à qui revient à espérer que la bonne personne soit dans la liste.
 */
export function SessionInviteResend() {
  const { id } = useDocumentInfo();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sessionAt, attendeeEmail, guests } = useFormFields(([fields]) => {
    const guests: string[] = [];
    for (let i = 0; fields[`sessionGuests.${i}.email`] !== undefined; i += 1) {
      const v = fields[`sessionGuests.${i}.email`]?.value as string | undefined;
      if (v) guests.push(v);
    }
    return {
      sessionAt: fields.sessionAt?.value as string | undefined,
      attendeeEmail: fields.attendeeEmail?.value as string | undefined,
      guests,
    };
  });

  if (!id) return null;

  if (!sessionAt) {
    return (
      <p className="jr-prev jr-prev--off">
        Aucun créneau retenu : il n&apos;y a pas encore de confirmation à envoyer.
      </p>
    );
  }

  const recipients = [attendeeEmail, ...guests].filter(Boolean) as string[];

  const send = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/admin/session-invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          body?.error === "forbidden"
            ? "Vous ne pouvez relancer que vos propres clients."
            : body?.error === "no_recipient"
              ? "Aucune adresse à qui envoyer."
              : "L'envoi a échoué. Réessayez.",
        );
        return;
      }
      setDone(true);
    } catch {
      setError("L'envoi a échoué. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="jr-gen">
      <p className="jr-gen__line">
        Renvoyer la confirmation à <strong>{recipients.length || "aucun"}</strong> destinataire
        {recipients.length > 1 ? "s" : ""}
        {recipients.length > 0 && <> · {recipients.join(", ")}</>}
      </p>
      <p className="jr-gen__hint">
        Le contact de l&apos;espace client la reçoit également. À utiliser quand le message n&apos;est
        pas arrivé, a été perdu, ou après avoir corrigé une adresse.
      </p>

      <button type="button" className="jr-btn" disabled={busy} onClick={() => void send()}>
        {busy ? "Envoi…" : "Renvoyer l'invitation"}
      </button>

      {done && <p className="jr-gen__done">Invitation renvoyée.</p>}
      {error && <p className="jr-gen__ko">{error}</p>}
    </div>
  );
}
