"use client";

import { toast, useDocumentInfo, useForm, useFormFields } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import { frDate } from "@/core/lib/dates";
import { useSaveAfterDispatch } from "@/modules/marketing/admin/useSaveAfterDispatch";
import {
  COMPANY_FIELDS,
  SIGNING_DOC_FIELDS,
  signingSteps,
  type SigningDocKey,
  type SigningStepState,
} from "@/modules/partner/lib/signing";

/**
 * En tête de l'onglet « Signature » : où en est l'affaire, et l'accès du
 * client à son espace.
 *
 * Tout se lit dans le FORMULAIRE : on dépose un devis juste en dessous, et
 * l'étape passe au vert avant même d'enregistrer. Les documents, eux, se
 * déposent dans les champs sous la liste — un seul endroit pour chaque pièce.
 *
 * « Fait par e-mail » pose la date de l'étape sans document, puis enregistre :
 * un clic = un état persisté. C'est le cas du devis envoyé en pièce jointe, ou
 * du contrat signé que le client a renvoyé par retour de mail.
 */

type Access = {
  hasAccount: boolean;
  email: string | null;
  active: boolean;
  lastLoginAt: string | null;
  invitationSentAt: string | null;
};

// Dérivé de COMPANY_FIELDS : un champ obligatoire ajouté là est lu ici aussi
// (la forme sociale et le représentant ne l'étaient pas, et l'étape restait
// « à compléter » sur une fiche pourtant complète).
const WATCHED = [
  ...new Set([
    ...COMPANY_FIELDS.map((f) => f.field),
    "siret",
    "email",
    ...Object.values(SIGNING_DOC_FIELDS).flatMap((f) => [f.doc, f.date]),
  ]),
];


function stateLine(step: SigningStepState): string {
  if (step.key === "entreprise") {
    return step.done ? "Complètes" : `Manque : ${step.missing?.join(", ")}`;
  }
  switch (step.via) {
    case "document":
      return step.at ? `Document déposé — ${frDate(step.at)}` : "Document déposé (pensez à enregistrer)";
    case "manuel":
      return `Fait par e-mail — ${frDate(step.at)}`;
    case "deduit":
      return "Acquis : la version signée est revenue";
    default:
      return "À faire";
  }
}

export function SigningChecklist() {
  const { id } = useDocumentInfo();
  const { dispatchFields } = useForm();
  const saveNow = useSaveAfterDispatch();

  // Une chaîne stable : le composant ne se recalcule que si l'un de ces champs change.
  const factsJson = useFormFields(([fields]) =>
    JSON.stringify(Object.fromEntries(WATCHED.map((k) => [k, fields[k]?.value ?? null]))),
  );
  const facts = JSON.parse(factsJson) as Record<string, unknown>;
  const steps = signingSteps(facts);
  const done = steps.filter((s) => s.done).length;

  const setManual = useCallback(
    (key: SigningDocKey, on: boolean) => {
      dispatchFields({
        type: "UPDATE",
        path: SIGNING_DOC_FIELDS[key].date,
        value: on ? new Date().toISOString() : null,
      });
      saveNow();
    },
    [dispatchFields, saveNow],
  );

  // ── Accès espace client ────────────────────────────────────────────────────
  const [access, setAccess] = useState<Access | null>(null);
  const [sending, setSending] = useState(false);

  const loadAccess = useCallback(() => {
    if (id == null) return;
    fetch(`/api/admin/signing-invite?clientId=${id}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<Access>) : null))
      .then(setAccess)
      .catch(() => setAccess(null));
  }, [id]);

  useEffect(loadAccess, [loadAccess]);

  const invite = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/admin/signing-invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id }),
      });
      const data = (await res.json().catch(() => null)) as { email?: string; message?: string } | null;
      if (!res.ok) throw new Error(data?.message || "L'invitation n'est pas partie.");
      toast.success(`Invitation envoyée à ${data?.email ?? "votre client"}.`);
      loadAccess();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (id == null) return null;

  const invited = Boolean(access?.active && access.invitationSentAt);

  return (
    <div className="field-type sig-box">
      <div className="sig-box__head">
        <span className="sig-box__title">Signature</span>
        <span className="sig-box__count">
          {done} sur {steps.length}
        </span>
      </div>
      <div className="sig-box__bar" role="img" aria-label={`${done} étapes sur ${steps.length}`}>
        {steps.map((s) => (
          <span key={s.key} className={`sig-box__seg${s.done ? " sig-box__seg--done" : ""}`} />
        ))}
      </div>

      {/* L'accès d'abord : sans lui, le client ne voit ni son devis ni son
          contrat, et ne peut rien renvoyer signé. */}
      <div className="sig-access">
        <div>
          <p className="sig-access__label">Espace client</p>
          <p className="sig-access__state">
            {!access
              ? "Lecture…"
              : !access.hasAccount
                ? "Pas encore d'accès."
                : !access.active
                  ? `Accès créé pour ${access.email}, pas encore envoyé.`
                  : invited
                    ? `Invitation envoyée à ${access.email} le ${frDate(access.invitationSentAt)}${
                        access.lastLoginAt ? ` · dernière connexion le ${frDate(access.lastLoginAt)}` : " · pas encore connecté"
                      }.`
                    : `Accès ouvert pour ${access.email}${
                        access.lastLoginAt ? ` · dernière connexion le ${frDate(access.lastLoginAt)}` : ""
                      }.`}
          </p>
        </div>
        {access && (
          <button type="button" className="sig-btn" disabled={sending} onClick={() => void invite()}>
            {sending
              ? "Envoi…"
              : access.active && access.hasAccount
                ? "Renvoyer l'invitation"
                : "Envoyer l'accès au client"}
          </button>
        )}
      </div>

      <ol className="sig-steps">
        {steps.map((step, i) => {
          const docKey = step.key === "entreprise" ? null : (step.key as SigningDocKey);
          return (
            <li key={step.key} className={`sig-step${step.done ? " sig-step--done" : ""}`}>
              <span className="sig-step__dot" aria-hidden>
                {step.done ? "✓" : i + 1}
              </span>
              <div className="sig-step__body">
                <p className="sig-step__label">
                  {step.label}
                  <span className="sig-step__who">{step.who}</span>
                </p>
                <p className="sig-step__state">{stateLine(step)}</p>
                {step.key === "entreprise" && !step.done && (
                  <p className="sig-step__hint">
                    À compléter dans l&apos;onglet « Facturation client », ou par le client dans son espace.
                  </p>
                )}
              </div>
              {docKey && !step.done && (
                <button type="button" className="sig-btn sig-btn--ghost" onClick={() => setManual(docKey, true)}>
                  Fait par e-mail
                </button>
              )}
              {docKey && step.via === "manuel" && (
                <button type="button" className="sig-btn sig-btn--link" onClick={() => setManual(docKey, false)}>
                  Annuler
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
