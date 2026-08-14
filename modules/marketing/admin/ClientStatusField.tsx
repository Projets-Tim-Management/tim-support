"use client";

import { FieldLabel, useDocumentInfo, useField } from "@payloadcms/ui";
import { useCallback, useState } from "react";

import { StartTestModal } from "@/modules/marketing/admin/StartTestModal";
import { CLIENT_STATUSES } from "@/modules/partner/lib/clientStatus";

/**
 * Champ « Statut » de la fiche client.
 *
 * Sa seule raison d'exister : intercepter le passage à « En test ». Ce n'est pas
 * un changement de statut comme les autres — c'est le démarrage d'un parcours de
 * plusieurs semaines, qui a besoin d'une date et d'un contact. Le laisser
 * s'appliquer en silence produirait une phase de test sans calendrier, ou un
 * refus à l'enregistrement (requireTestSchedule) sans moyen de le corriger.
 *
 * Le modal est le même que celui du Kanban : un seul écran de démarrage, quel
 * que soit l'endroit d'où on l'enclenche.
 */
export function ClientStatusField({ path, field }: { path?: string; field?: { label?: unknown } }) {
  const { value, setValue } = useField<string>({ path: path ?? "clientStatus" });
  const { id, savedDocumentData } = useDocumentInfo();
  const [asking, setAsking] = useState(false);

  // L'adresse de la fiche pré-remplit le modal : elle est déjà connue, la
  // redemander au démarrage était une saisie pour rien (et une occasion de
  // faute de frappe sur l'adresse qui portera tout le parcours).
  const saved = savedDocumentData as { companyName?: string; email?: string } | undefined;
  const companyName = saved?.companyName;

  const onChange = useCallback(
    (next: string) => {
      // Fiche jamais enregistrée : aucun client auquel rattacher un parcours.
      // On laisse passer — le garde-fou serveur ne contrôle pas les créations.
      if (next === "en-test" && value !== "en-test" && id) {
        setAsking(true);
        return;
      }
      setValue(next);
    },
    [id, setValue, value],
  );

  return (
    <div className="field-type select">
      <FieldLabel label={(field?.label as string) ?? "Statut"} path={path} />

      <select
        className="jr-status-select"
        value={value ?? "prospect"}
        onChange={(e) => onChange(e.target.value)}
      >
        {CLIENT_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {asking && id && (
        <StartTestModal
          client={{ id, companyName }}
          defaultEmail={saved?.email}
          onCancel={() => setAsking(false)}
          onDone={() => {
            setAsking(false);
            // Posé dans le FORMULAIRE : les onglets « Dossier de démarrage » et
            // « Espace client » apparaissent aussitôt, l'enregistrement confirme.
            setValue("en-test");
          }}
        />
      )}
    </div>
  );
}
