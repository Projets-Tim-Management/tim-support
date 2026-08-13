"use client";

import { useDocumentInfo, useForm, useFormFields } from "@payloadcms/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { StartTestModal } from "@/modules/marketing/admin/StartTestModal";
import { runStatusMeta } from "@/modules/marketing/lib/journey";

/**
 * Encart « Phase de test » de la fiche client (barre latérale).
 *
 * Résumé compact — statut, dates, avancement, étape en cours — avec un lien
 * vers le parcours complet. La fiche client répond ainsi d'un coup d'œil à la
 * seule question qu'on se pose en l'ouvrant : « où en est-on avec eux ? ».
 *
 * Lecture via l'API REST (comme PartnerActivity) : l'access control s'applique,
 * un partenaire ne voit donc que ses propres parcours.
 */

type Run = {
  id: number | string;
  status?: string;
  startDate?: string;
  endDate?: string;
  stepsDone?: number;
  stepsTotal?: number;
  currentStepLabel?: string;
};

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" }) : "—";


export function ClientJourneyBox() {
  const { id, savedDocumentData } = useDocumentInfo();
  const { dispatchFields } = useForm();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [justStarted, setJustStarted] = useState(false);

  const companyName = (savedDocumentData as { companyName?: string } | undefined)?.companyName;

  /**
   * Fin du démarrage (le modal a créé le parcours et l'accès espace client) :
   * la fiche bascule sur « En test ».
   *
   * Ce second geste n'est pas cosmétique — c'est le statut qui ouvre les onglets
   * « Dossier de démarrage » et « Espace client ». Il est posé dans le
   * FORMULAIRE et non en base : les onglets apparaissent tout de suite, et
   * l'enregistrement de la fiche confirme, sans écrire derrière le dos d'un
   * formulaire qui peut avoir d'autres modifications en cours.
   */
  /** Lit le parcours du client sans toucher à l'état — sert aussi de revérification. */
  const fetchRun = useCallback(async (): Promise<Run | null> => {
    if (!id) return null;
    try {
      const res = await fetch(
        `/payload-api/journey-runs?where[client][equals]=${id}&limit=1&depth=0&sort=-createdAt`,
        { credentials: "include" },
      );
      const data = res.ok ? await res.json() : null;
      return (data?.docs?.[0] as Run) ?? null;
    } catch {
      return null;
    }
  }, [id]);

  const reload = useCallback(async () => {
    setRun(await fetchRun());
    setLoading(false);
  }, [fetchRun]);

  const onStarted = useCallback(() => {
    setAsking(false);
    setJustStarted(true);
    dispatchFields({ type: "UPDATE", path: "clientStatus", value: "en-test" });
    void reload();
  }, [dispatchFields, reload]);

  /**
   * FILET DE SÉCURITÉ — le statut passé à « En test » ouvre le modal, d'où qu'il
   * vienne.
   *
   * Le champ « Statut » intercepte déjà le changement à la source, mais il ne
   * couvre que SON input : un statut modifié autrement (composant remplacé, autre
   * écran, valeur posée par du code) passerait au travers et produirait une
   * phase de test sans calendrier — qui échouerait ensuite à l'enregistrement.
   * On surveille donc l'ÉTAT DU FORMULAIRE, pas un événement de saisie.
   */
  const formStatus = useFormFields(([fields]) => fields?.clientStatus?.value as string | undefined);
  const savedStatus = (savedDocumentData as { clientStatus?: string } | undefined)?.clientStatus;

  useEffect(() => {
    if (loading || run || !id || asking || justStarted) return;
    if (formStatus !== "en-test") return;

    let cancelled = false;
    (async () => {
      // Le champ « Statut » a peut-être déjà créé le parcours à l'instant : on
      // revérifie avant d'ouvrir, sinon deux modals s'empileraient.
      const fresh = await fetchRun();
      if (cancelled) return;
      if (fresh) setRun(fresh);
      else setAsking(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [formStatus, loading, run, id, asking, justStarted, fetchRun]);

  /**
   * Abandon : on remet le statut d'avant. Laisser la fiche sur « En test » sans
   * parcours serait le pire des deux mondes — l'enregistrement serait refusé
   * (requireTestSchedule) sans que l'utilisateur comprenne pourquoi.
   */
  const onCancel = useCallback(() => {
    setAsking(false);
    if (formStatus === "en-test") {
      dispatchFields({
        type: "UPDATE",
        path: "clientStatus",
        value: savedStatus && savedStatus !== "en-test" ? savedStatus : "en-cours",
      });
    }
  }, [dispatchFields, formStatus, savedStatus]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Fiche jamais enregistrée : pas d'id, donc rien à rattacher.
  if (!id) return null;
  if (loading) return <div className="jr-box jr-box--loading">Phase de test…</div>;

  if (!run) {
    return (
      <div className="jr-box">
        <h4 className="jr-box__title">Phase de test</h4>
        <p className="jr-box__empty">Aucune phase de test pour ce client.</p>

        <button type="button" className="jr-btn" onClick={() => setAsking(true)}>
          Démarrer la phase de test
        </button>

        {asking && (
          <StartTestModal
            client={{ id, companyName }}
            onCancel={onCancel}
            onDone={onStarted}
          />
        )}
      </div>
    );
  }

  const meta = runStatusMeta(run.status);
  const total = run.stepsTotal ?? 0;
  const done = run.stepsDone ?? 0;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="jr-box">
      <h4 className="jr-box__title">Phase de test</h4>

      {justStarted && (
        <p className="jr-box__notice">
          Phase créée et client passé « En test ». <strong>Enregistrez la fiche</strong> pour
          confirmer — les onglets « Dossier de démarrage » et « Espace client » sont apparus.
        </p>
      )}

      {meta && (
        <span className="tim-status-pill" style={{ background: meta.bg, color: meta.color }}>
          {meta.label}
        </span>
      )}

      <p className="jr-box__dates">
        {fmt(run.startDate)} → {fmt(run.endDate)}
      </p>

      <div className="jr-box__bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="jr-box__count">
        {done}/{total} étapes
      </p>

      {run.currentStepLabel && (
        <p className="jr-box__current">
          <span className="jr-box__current-k">En cours</span>
          {run.currentStepLabel}
        </p>
      )}

      <Link className="jr-box__cta" href={`/admin/collections/journey-runs/${run.id}`}>
        Ouvrir la phase de test
      </Link>
    </div>
  );
}
