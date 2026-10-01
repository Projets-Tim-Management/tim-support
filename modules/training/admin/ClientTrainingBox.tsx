"use client";

import { useAuth, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import { hasAdminRole } from "@/core/access";
import { TrainingPlanEditor } from "@/modules/training/admin/TrainingPlanEditor";
import { planSteps, type PlanDay, type PlanSession } from "@/modules/training/lib/plan";
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
 * Le plan lui-même (journées, créneaux, participants) se construit en plein
 * écran (TrainingPlanEditor) : la colonne de droite est trop étroite pour ça.
 * L'encart en donne le résumé — les étapes constatées, ce qui reste à faire.
 *
 * Lecture par l'API REST : l'access control s'applique, un partenaire ne voit
 * que les formations de ses clients.
 */

type Training = {
  id: number | string;
  status?: string;
  openedAt?: string;
  closedAt?: string;
  defaultAccessDelivery?: string;
};

type Plan = { days: PlanDay[]; sessions: PlanSession[] };

const fmt = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  ouvert: { color: "var(--tim-purple)", bg: "var(--tim-purple-bg)" },
  termine: { color: "var(--tim-green)", bg: "var(--tim-green-bg)" },
  annule: { color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" },
};

async function list<T>(collection: string, where: string): Promise<T[]> {
  const res = await fetch(`/payload-api/${collection}?${where}&limit=300&depth=0`, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json())?.docs as T[]) ?? [];
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
  const partnerRef = useFormFields(([fields]) => fields?.partner?.value as unknown);
  const companyName = useFormFields(([fields]) => fields?.companyName?.value as string | undefined);
  const partnerId =
    partnerRef && typeof partnerRef === "object" ? ((partnerRef as { id?: number | string }).id ?? null) : ((partnerRef as number | string) ?? null);

  const [training, setTraining] = useState<Training | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

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
        const [days, sessions] = await Promise.all([
          list<PlanDay>("training-days", by),
          list<Record<string, unknown>>("training-sessions", by),
        ]);
        setPlan({
          days,
          sessions: sessions.map((s) => ({
            ...(s as PlanSession),
            day: (s.day && typeof s.day === "object" ? (s.day as { id: number | string }).id : s.day) as number | string,
          })),
        });
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

      {plan && <PlanSummary plan={plan} />}

      <button
        type="button"
        className={admin && !closed ? "jr-btn tr-box__plan" : "jr-box__cta tr-box__link"}
        onClick={() => setEditing(true)}
      >
        {admin && !closed ? (plan?.days.length ? "Modifier le plan" : "Construire le plan") : "Voir le plan"}
      </button>

      {error && <p className="jr-box__ko">{error}</p>}
      {openButton}

      {admin && !closed && (
        <button type="button" className="jr-btn jr-btn--small jr-btn--quiet tr-box__cancel" disabled={busy} onClick={cancel}>
          Annuler la formation
        </button>
      )}

      {editing && (
        <TrainingPlanEditor
          trainingId={training.id}
          clientId={id}
          partnerId={partnerId}
          companyName={companyName}
          defaultAccessDelivery={training.defaultAccessDelivery}
          // Une formation close se consulte, elle ne se replanifie pas.
          readOnly={!admin || closed}
          onClose={() => {
            setEditing(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

/** Où en est le plan, en une ligne : ce qui est fait, puis ce qui manque. */
function PlanSummary({ plan }: { plan: Plan }) {
  const steps = planSteps(plan.days, plan.sessions);
  const active = plan.sessions.filter((s) => s.status !== "annulee");
  const next = steps.find((s) => !s.done);
  return (
    <div className="jr-box__current">
      <span className="jr-box__current-k">Plan de formation</span>
      {plan.days.length === 0
        ? "À construire : aucune journée pour l'instant."
        : `${plan.days.length} journée${plan.days.length > 1 ? "s" : ""}, ${active.length} séance${active.length > 1 ? "s" : ""}`}
      {plan.days.length > 0 && (
        <ul className="tr-box__steps">
          {steps.map((s) => (
            <li key={s.key} className={s.done ? "is-done" : ""}>
              {s.done ? "✓" : "○"} {s.label}
            </li>
          ))}
        </ul>
      )}
      {plan.days.length > 0 && next && <span className="tr-box__next">À faire : {next.hint.toLowerCase()}</span>}
    </div>
  );
}
