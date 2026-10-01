"use client";

import { useAuth, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import { hasAdminRole } from "@/core/access";
import { TRAINING_STATUSES, isTrainingClosed, trainingBeforeActivation } from "@/modules/training/lib/training";

/**
 * Encart « Formation » de la fiche client (barre latérale, sous le parcours).
 *
 * Répond à « ce client a-t-il une formation, et où en est-elle ? ». Le parcours
 * est FACULTATIF : sans formation, l'encart ne s'affiche qu'à TIM, avec le
 * bouton qui l'ouvre — un partenaire n'a rien à y faire tant qu'il n'y en a pas.
 *
 * Ouvrable à tout moment, mais la formation se fait logiquement après
 * l'activation du compte de production : on le DIT avant d'ouvrir, sans bloquer.
 *
 * Lecture par l'API REST : l'access control s'applique, un partenaire ne voit
 * que les formations de ses clients.
 */

type Training = {
  id: number | string;
  status?: string;
  openedAt?: string;
  closedAt?: string;
};

type Plan = { days: number; sessions: number; undated: number };

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  ouvert: { color: "var(--tim-purple)", bg: "var(--tim-purple-bg)" },
  termine: { color: "var(--tim-green)", bg: "var(--tim-green-bg)" },
  annule: { color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" },
};

async function count(collection: string, where: string): Promise<number> {
  const res = await fetch(`/payload-api/${collection}?${where}&limit=1&depth=0`, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json())?.totalDocs as number) ?? 0;
}

async function errorOf(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data?.errors?.[0]?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function ClientTrainingBox() {
  const { id, savedDocumentData } = useDocumentInfo();
  // Change à chaque enregistrement de la fiche : la case « Formation incluse »
  // du passage « En signature » ouvre la formation côté serveur, l'encart doit
  // le voir sans recharger la page.
  const savedAt = (savedDocumentData as { updatedAt?: string } | undefined)?.updatedAt;
  const { user } = useAuth();
  const admin = hasAdminRole(user);
  const clientStatus = useFormFields(([fields]) => fields?.clientStatus?.value as string | undefined);

  const [training, setTraining] = useState<Training | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(
        `/payload-api/trainings?where[client][equals]=${id}&sort=-createdAt&limit=1&depth=0`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(String(res.status));
      const t = ((await res.json())?.docs?.[0] as Training) ?? null;
      setTraining(t);
      if (t) {
        const by = `where[training][equals]=${t.id}`;
        const [days, sessions, undated] = await Promise.all([
          count("training-days", by),
          count("training-sessions", by),
          count("training-days", `${by}&where[date][exists]=false`),
        ]);
        setPlan({ days, sessions, undated });
      } else {
        setPlan(null);
      }
      setFailed(false);
    } catch {
      // « Aucune formation » et « lecture impossible » sont deux réponses
      // différentes : la seconde ne doit surtout pas proposer d'en ouvrir une.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload, savedAt]);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/payload-api/trainings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: id }),
      });
      if (!res.ok) setError(await errorOf(res, "La formation n'a pas pu être ouverte."));
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!training) return;
    if (!window.confirm("Annuler cette formation ? Son plan reste consultable, mais plus rien ne sera envoyé.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/payload-api/trainings/${training.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "annule" }),
      });
      if (!res.ok) setError(await errorOf(res, "La formation n'a pas pu être annulée."));
      await reload();
    } finally {
      setBusy(false);
    }
  };

  // Fiche jamais enregistrée : rien à rattacher.
  if (!id) return null;
  if (loading) return admin ? <div className="jr-box jr-box--loading">Formation…</div> : null;

  if (failed) {
    return (
      <div className="jr-box">
        <h4 className="jr-box__title">Formation</h4>
        <p className="jr-box__empty">
          Impossible de lire la formation de ce client. Rechargez la page&nbsp;; si le problème persiste,
          prévenez l&apos;équipe technique.
        </p>
      </div>
    );
  }

  const closed = !training || isTrainingClosed(training.status);

  // Pas de formation du tout : seul TIM voit l'encart (et peut en ouvrir une).
  if (!training && !admin) return null;

  const openButton = admin && closed && (
    <>
      {trainingBeforeActivation(clientStatus) && (
        <p className="tr-box__warn">
          Le compte de production n&apos;est pas encore activé. La formation se fait normalement après — vous
          pouvez l&apos;ouvrir dès maintenant pour préparer le plan.
        </p>
      )}
      <button type="button" className="jr-btn" disabled={busy} onClick={open}>
        {training ? "Ouvrir une nouvelle formation" : "Ouvrir un parcours formation"}
      </button>
    </>
  );

  if (!training) {
    return (
      <div className="jr-box">
        <h4 className="jr-box__title">Formation</h4>
        <p className="jr-box__empty">Aucune formation pour ce client. Facultative : payée ou offerte.</p>
        {error && <p className="jr-box__ko">{error}</p>}
        {openButton}
      </div>
    );
  }

  const style = STATUS_STYLE[training.status ?? "ouvert"] ?? STATUS_STYLE.ouvert;
  const label = TRAINING_STATUSES.find((s) => s.value === training.status)?.label ?? "Formation";

  return (
    <div className="jr-box">
      <h4 className="jr-box__title">Formation</h4>
      <span className="tim-status-pill" style={{ background: style.bg, color: style.color }}>
        {label}
      </span>
      <p className="jr-box__dates">
        {closed ? `Close le ${fmt(training.closedAt)}` : `Ouverte le ${fmt(training.openedAt)}`}
      </p>

      {plan && (
        <p className="jr-box__current">
          <span className="jr-box__current-k">Plan de formation</span>
          {plan.days === 0
            ? "À construire : aucune journée pour l'instant."
            : `${plan.days} journée${plan.days > 1 ? "s" : ""}, ${plan.sessions} séance${plan.sessions > 1 ? "s" : ""}` +
              (plan.undated ? ` — ${plan.undated} à dater` : "")}
        </p>
      )}

      {error && <p className="jr-box__ko">{error}</p>}
      {openButton}

      {admin && !closed && (
        <button type="button" className="jr-btn jr-btn--small jr-btn--quiet tr-box__cancel" disabled={busy} onClick={cancel}>
          Annuler la formation
        </button>
      )}
    </div>
  );
}
