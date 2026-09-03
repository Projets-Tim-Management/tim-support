"use client";

import { FieldLabel, useDocumentInfo, useField } from "@payloadcms/ui";
import { useCallback, useState } from "react";

import { StartTestModal } from "@/modules/marketing/admin/StartTestModal";
import { useSaveAfterDispatch } from "@/modules/marketing/admin/useSaveAfterDispatch";
import { ContractStartModal } from "@/modules/partner/admin/ContractStartModal";
import { LossReasonModal } from "@/modules/partner/admin/LossReasonModal";
import {
  CLIENT_STATUSES,
  DEFAULT_CLIENT_STATUS,
  clientStatusMeta,
} from "@/modules/partner/lib/clientStatus";
import { needsLossReason } from "@/modules/partner/lib/lossReason";

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
 *  - « Perdue », « Résilié » et « Archivé » ferment l'opportunité : on demande
 *    POURQUOI (requireLossReason). Personne ne revient renseigner un motif trois
 *    semaines plus tard.
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
  /** Statut de clôture en attente de motif (`perdue`, `resilie`, `archive`). */
  const [askingLoss, setAskingLoss] = useState<string | null>(null);
  const { setValue: setLossReason } = useField<string>({ path: "lossReason" });
  const { setValue: setLossDetail } = useField<string>({ path: "lossReasonDetail" });
  const { setValue: setEndDate } = useField<string>({ path: "resiliationDate" });
  /**
   * Enregistrer DANS le geste, pas après.
   *
   * Le modal de clôture demandait le motif, remplissait les champs… et laissait
   * la fiche non enregistrée. On croyait l'affaire close — elle ne l'était pas,
   * et un onglet fermé entre-temps emportait le motif avec lui. Valider un
   * motif EST la clôture : le clic doit la produire, pas la préparer.
   *
   * `useSaveAfterDispatch` attend le rendu suivant avant d'enregistrer : les
   * valeurs posées à l'instant ne sont dans l'état du formulaire qu'après le
   * commit, et enchaîner directement enregistrerait la fiche telle qu'elle
   * était.
   */
  const saveNow = useSaveAfterDispatch();

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
      // Clôture : le motif se demande maintenant, pas après.
      if (needsLossReason(next) && value !== next) {
        setAskingLoss(next);
        return;
      }
      setValue(next);
    },
    [contractStart, setValue, value, id],
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

      {askingLoss && (
        <LossReasonModal
          status={askingLoss}
          companyName={companyName}
          onCancel={() => setAskingLoss(null)}
          onConfirm={(outcome) => {
            setLossReason(outcome.reason);
            setLossDetail(outcome.detail);
            if (outcome.endDate) setEndDate(outcome.endDate);
            setValue(askingLoss);
            setAskingLoss(null);
            // La fiche part en enregistrement dans la foulée : le motif saisi
            // est déjà en base quand le modal se ferme.
            saveNow();
          }}
        />
      )}

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
