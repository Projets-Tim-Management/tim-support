"use client";

import { FieldLabel, useDocumentInfo, useField } from "@payloadcms/ui";
import { useCallback, useState } from "react";

import { StartTestModal } from "@/modules/marketing/admin/StartTestModal";
import { ContractStartModal } from "@/modules/partner/admin/ContractStartModal";
import {
  CLIENT_STATUSES,
  DEFAULT_CLIENT_STATUS,
  clientStatusMeta,
} from "@/modules/partner/lib/clientStatus";

/**
 * Champ « Statut » de la fiche client.
 *
 * Sa raison d'exister : intercepter les DEUX bascules qui ne sont pas de simples
 * changements de statut.
 *
 *  - « En phase de test » démarre un parcours de plusieurs semaines, qui a besoin
 *    d'une date et d'un contact. Le laisser s'appliquer en silence produirait une
 *    phase de test sans calendrier, ou un refus à l'enregistrement
 *    (requireTestSchedule) sans moyen de le corriger.
 *  - « Gagnée » enclenche l'abonnement mensuel, qui a besoin d'une date de début
 *    de contrat (requireContractStart). On la demande dans le geste plutôt que
 *    de laisser l'utilisateur découvrir un client gagné à zéro euro.
 *
 * Les modals sont les mêmes que ceux du Kanban : un seul écran par geste, quel
 * que soit l'endroit d'où on l'enclenche.
 */
export function ClientStatusField({ path, field }: { path?: string; field?: { label?: unknown } }) {
  const { value, setValue } = useField<string>({ path: path ?? "clientStatus" });
  // Date de début de contrat : lue pour ne redemander que si elle manque, écrite
  // depuis le modal (le geste renseigne le champ, l'enregistrement le confirme).
  const { value: contractStart, setValue: setContractStart } = useField<string>({
    path: "contractStartDate",
  });
  const { id, savedDocumentData } = useDocumentInfo();
  const [asking, setAsking] = useState(false);
  const [askingContract, setAskingContract] = useState(false);

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
      // Contrairement à la phase de test, ça marche aussi sur une fiche jamais
      // enregistrée : le modal ne fait que remplir deux champs du formulaire.
      if (next === "actif" && value !== "actif" && !contractStart) {
        setAskingContract(true);
        return;
      }
      setValue(next);
    },
    [contractStart, id, setValue, value],
  );

  return (
    <div className="field-type select">
      <FieldLabel label={(field?.label as string) ?? "Statut"} path={path} />

      {/* Pastille de couleur : le statut vit maintenant dans la colonne
          latérale, visible depuis tous les onglets. La couleur (la même que le
          Kanban et le tableau) le rend lisible d'un coup d'œil, sans lire. */}
      <div className="jr-status-wrap">
        <span
          className="jr-status-dot"
          style={{ background: clientStatusMeta(value ?? DEFAULT_CLIENT_STATUS)?.color }}
          aria-hidden
        />
        <select
          className="jr-status-select"
          value={value ?? DEFAULT_CLIENT_STATUS}
          onChange={(e) => onChange(e.target.value)}
        >
          {CLIENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {askingContract && (
        <ContractStartModal
          companyName={companyName}
          onCancel={() => setAskingContract(false)}
          onConfirm={(iso) => {
            setAskingContract(false);
            setContractStart(iso);
            setValue("actif");
          }}
        />
      )}

      {asking && id && (
        <StartTestModal
          client={{ id, companyName }}
          defaultEmail={saved?.email}
          onCancel={() => setAsking(false)}
          onDone={() => {
            setAsking(false);
            // Posé dans le FORMULAIRE : les onglets « Dossier & accès » et
            // « Espace client » apparaissent aussitôt, l'enregistrement confirme.
            setValue("en-test");
          }}
        />
      )}
    </div>
  );
}
