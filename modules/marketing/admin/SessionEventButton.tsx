"use client";

import { useDocumentInfo, useForm, useFormFields } from "@payloadcms/ui";
import { useState } from "react";

/**
 * « Mettre à l'agenda » — rattrape un créneau réservé resté sans événement.
 *
 * L'événement naît normalement quand le client pose sa date. Si l'agenda du
 * partenaire était injoignable ce jour-là (jeton expiré, agenda connecté après
 * coup), le créneau reste enregistré sans événement ni lien de visio. Le seul
 * recours était d'effacer puis reposer la date — une manipulation qui ressemble
 * à une bidouille, sur une donnée que le client a choisie.
 *
 * Le bouton n'apparaît QUE dans ce cas : un créneau sans événement. Quand tout
 * s'est bien passé, il n'a rien à dire et reste invisible.
 */
export function SessionEventButton() {
  const { id, savedDocumentData, initialData } = useDocumentInfo();
  const { dispatchFields } = useForm();
  const form = useFormFields(([fields]) => ({
    sessionAt: fields.sessionAt?.value as string | undefined,
    eventId: fields.sessionEventId?.value as string | undefined,
    mode: fields.sessionMode?.value as string | undefined,
  }));

  /**
   * `sessionEventId` est un champ `admin.hidden` : selon l'état du formulaire il
   * n'est pas garanti d'être présent côté client. On retombe donc sur le
   * document enregistré. Se tromper ici a un coût réel — un bouton affiché sur
   * un créneau déjà en agenda inviterait à créer un DOUBLON.
   */
  const saved = (savedDocumentData ?? initialData ?? {}) as Record<string, unknown>;
  const sessionAt = (form.sessionAt ?? saved.sessionAt) as string | undefined;
  const eventId = (form.eventId ?? saved.sessionEventId) as string | undefined;
  const mode = (form.mode ?? saved.sessionMode) as string | undefined;

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rien à rattraper : pas de créneau, ou l'événement existe déjà.
  // `message` fait exception : l'événement vient d'être créé, donc `eventId`
  // est désormais rempli — disparaître sans un mot laisserait un doute sur ce
  // qui s'est passé. L'encart reste, en confirmation, jusqu'au prochain
  // chargement de la page.
  if (!id || !sessionAt || (eventId && !message)) return null;

  if (message) {
    return (
      <div className="jr-evt jr-evt--done">
        <p className="jr-evt__ok">{message}</p>
        <p className="jr-evt__text">
          Les participants ont reçu l&apos;invitation de la part de l&apos;agenda du partenaire.
        </p>
      </div>
    );
  }

  return (
    <div className="jr-evt">
      <p className="jr-evt__text">
        Ce créneau n&apos;est <strong>dans aucun agenda</strong>
        {mode !== "sur-place" ? " et n'a donc pas de lien de visio" : ""}. C&apos;est le cas quand
        l&apos;agenda du partenaire n&apos;était pas joignable au moment de la réservation.
      </p>
      <button
        type="button"
        className="jr-evt__btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setMessage(null);
          try {
            let res: Response;
            try {
              res = await fetch("/api/admin/session-event", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ runId: id }),
              });
            } catch {
              /**
               * « Failed to fetch » ne dit rien à personne. Et surtout, il ne
               * dit PAS que rien n'a eu lieu : la requête peut très bien avoir
               * abouti côté serveur, avec l'événement créé, et seule la réponse
               * s'être perdue. C'est exactement ce qui s'est produit le
               * 27/08/2026 — l'annonce rassurante d'un « rien n'a été créé »
               * avait alors conduit à recliquer, donc à un doublon.
               *
               * Recliquer reste sans danger — le serveur retrouve désormais
               * l'événement orphelin au lieu d'en créer un second — mais le
               * message ne doit pas affirmer ce qu'il ignore.
               */
              throw new Error(
                "Réponse du serveur perdue. Rechargez la page pour voir si l'événement a été créé, " +
                  "puis réessayez si besoin.",
              );
            }
            const json = (await res.json().catch(() => ({}))) as { error?: string; sessionLink?: string | null; eventId?: string | null };
            if (!res.ok) {
              throw new Error(
                json.error ?? `Création impossible (erreur ${res.status}). Réessayez.`,
              );
            }
            /**
             * On recopie le résultat dans le formulaire au lieu de recharger la
             * page. Même effet à l'écran — le lien s'affiche, l'encart
             * disparaît — sans perdre ce qui aurait été saisi entre-temps.
             *
             * `initialValue` est posé en même temps que `value` : la valeur est
             * DÉJÀ enregistrée en base par la route, la marquer comme modifiée
             * afficherait une alerte « modifications non enregistrées »
             * mensongère.
             */
            const write = (path: string, value: string | null) =>
              dispatchFields({ type: "UPDATE", path, value, initialValue: value, valid: true });
            write("sessionEventId", json.eventId ?? null);
            write("sessionLink", json.sessionLink ?? null);
            setMessage(
              json.sessionLink
                ? "Événement créé et lien de visio récupéré."
                : "Événement créé dans l'agenda.",
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Création…" : "Mettre à l'agenda"}
      </button>
      {error && <p className="jr-evt__err">{error}</p>}
    </div>
  );
}
