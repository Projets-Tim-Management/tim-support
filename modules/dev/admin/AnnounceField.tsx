"use client";

import { useDocumentInfo, useField, useForm, useFormFields } from "@payloadcms/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnnounceDrawer, type AnnounceTarget } from "@/modules/dev/admin/AnnounceDrawer";
import { statusHasRole, type DevStatusDoc } from "@/modules/dev/lib/devStatus";

/**
 * Dans la barre latérale de la FICHE, sous le statut : la fenêtre « Prévenir
 * les demandeurs » s'ouvre quand on choisit « Terminé » (un statut qui porte ce
 * rôle), et un bouton permet de la rouvrir plus tard. Le Kanban, lui, l'ouvre
 * quand on dépose la carte dans la colonne (voir DevBoard).
 *
 * « Envoyer » enregistre d'abord la fiche : envoyer sans enregistrer laisserait
 * une fiche « En test » dont les clients ont pourtant reçu « c'est disponible ».
 */

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });

export const AnnounceField = () => {
  const { id } = useDocumentInfo();
  const { submit } = useForm();

  const { value: statusValue } = useField<number | string | null>({ path: "status" });
  const { value: announcedAt, setValue: setAnnouncedAt } = useField<string | null>({ path: "announcedAt" });
  const devTitle = useFormFields(([fields]) => String(fields?.title?.value ?? ""));
  const requesterCount = useFormFields(([fields]) => {
    const v = fields?.opportunities?.value;
    return Array.isArray(v) ? v.length : 0;
  });

  const [statuses, setStatuses] = useState<DevStatusDoc[] | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/payload-api/dev-statuses?limit=200&sort=position&depth=0", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { docs: [] }))
      .then((d) => active && setStatuses(Array.isArray(d?.docs) ? d.docs : []))
      .catch(() => active && setStatuses([]));
    return () => {
      active = false;
    };
  }, []);

  const current = statuses?.find((s) => String(s.id) === String(statusValue)) ?? null;
  const announces = Boolean(current && statusHasRole(current, "annonce"));

  const [target, setTarget] = useState<AnnounceTarget | null>(null);
  // L'intitulé proposé : celui de la fiche tel qu'il est À L'ÉCRAN, même pas
  // encore enregistré — c'est ce qu'on a sous les yeux.
  const open = useCallback(() => {
    if (id != null) setTarget({ id, title: devTitle.trim() });
  }, [devTitle, id]);
  const close = useCallback(() => setTarget(null), []);

  /**
   * Ouverture AUTOMATIQUE : quand le statut passe, à l'écran, d'un statut qui
   * n'annonce pas à un statut qui annonce. Pas à l'ouverture de la fiche — une
   * fiche déjà « Terminée » qu'on rouvre pour corriger une note n'a pas à
   * réclamer un envoi ; le bouton reste là pour ça.
   */
  const previousAnnounces = useRef<boolean | null>(null);
  useEffect(() => {
    if (statuses === null) return;
    const was = previousAnnounces.current;
    previousAnnounces.current = announces;
    if (was === false && announces && !announcedAt && requesterCount > 0) open();
  }, [announces, announcedAt, open, requesterCount, statuses]);

  if (id == null) return null;

  return (
    <div className="field-type dev-cfield dev-announce">
      {announcedAt ? (
        <p className="dev-cfield__hint">
          Clients prévenus le {fmt(announcedAt)}.
          {requesterCount > 0 && (
            <>
              {" "}
              <button type="button" className="dev-announce__again" onClick={open}>
                Renvoyer…
              </button>
            </>
          )}
        </p>
      ) : announces && requesterCount > 0 ? (
        <button type="button" className="dev-announce__open" onClick={open}>
          Prévenir les demandeurs…
        </button>
      ) : null}

      <AnnounceDrawer
        dev={target}
        onClose={close}
        // La fiche d'abord : le statut choisi doit exister avant que les
        // clients apprennent que c'est livré.
        beforeSend={async () => {
          const r = await submit();
          // Fiche non enregistrée — refus du serveur, validation côté
          // formulaire, réseau : `submit` ne rend `{ res }` qu'en cas de succès.
          // On n'écrit pas aux clients qu'un développement est livré alors que
          // son statut n'a pas pris.
          if (!r || typeof r !== "object" || !("res" in r) || !r.res?.ok) throw new Error("save_failed");
        }}
        onSent={(at) => setAnnouncedAt(at)}
      />
    </div>
  );
};
