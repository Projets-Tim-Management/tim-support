"use client";

import { toast } from "@payloadcms/ui";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { SIGNATURE_FONT_CLASS } from "@/components/portal/signature-fonts";
import { CodeInput } from "@/components/signing/CodeInput";
import { FieldChecklist } from "@/components/signing/FieldChecklist";
import { PdfSigner } from "@/components/signing/PdfSigner";
import { SignatureStylePicker } from "@/components/signing/SignatureStylePicker";
import { useClickedFields } from "@/components/signing/useClickedFields";
import { adminApi, viewerUrl } from "@/modules/partner/admin/contract-api";
import { confirmationsFrom, isActionField, type SignPlan } from "@/modules/partner/lib/sign-fields";
import { initialsOf, type SignatureStyle } from "@/modules/partner/lib/signature-styles";

/**
 * Contresigner un contrat signé par le client — le pendant, côté TIM, de la
 * signature en ligne du client : ses coordonnées et le rendu de signature,
 * puis le document façon DocuSign (étiquettes « Parapher » à droite de chaque
 * case, « Signer » dans le bloc « Le Prestataire »), l'acceptation, et un code
 * reçu par e-mail sur l'adresse de l'admin connecté. À la validation, le client reçoit
 * son exemplaire signé par les deux parties.
 */

type Info = {
  plan: SignPlan | null;
  reference: string;
  signedUrl: string;
  signer: { firstName: string; lastName: string; role: string };
  sentTo: string;
  consent: string;
};

/** Ces refus rendent la demande de code caduque : on repart des coordonnées. */
const RESTART_ON = ["expired", "locked", "document_changed", "not_requester"];

/** Le contrat à contresigner : son plan de champs et le PDF signé du client. */
async function fetchInfo(contractId: number | string): Promise<Info> {
  const r = await fetch(`/api/admin/contracts/${contractId}/countersign`, { credentials: "include" });
  const d = (await r.json().catch(() => ({}))) as Info & { error?: string };
  if (!r.ok) throw new Error(d.error ?? "Contrat indisponible");
  return d;
}

export function CountersignDrawer({
  contractId,
  onClose,
  onDone,
}: {
  contractId: number | string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [step, setStep] = useState<"form" | "document" | "code" | "done">("form");
  const { clicked, toggleField, resetFields } = useClickedFields();
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", role: "" });
  const [style, setStyle] = useState<SignatureStyle>("elegante");
  const [accepted, setAccepted] = useState(false);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string | null; clientNotified: boolean } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  // Posé AVANT le rendu qui grise le bouton : un double clic ne part qu'une fois.
  const busyRef = useRef(false);

  // Chargé UNE fois par contrat. `onClose` est recréé à chaque rendu de la
  // fiche (qui se rafraîchit souvent) : l'avoir en dépendance relançait ce
  // chargement et écrasait les coordonnées que l'on venait de saisir.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    let cancelled = false;
    fetchInfo(contractId)
      .then((d) => {
        if (cancelled) return;
        setInfo(d);
        setForm(d.signer);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error((e as Error).message);
        onCloseRef.current();
      });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const post = <T,>(url: string, body: object) => adminApi<T>(url, { method: "POST", body: JSON.stringify(body) });

  const requestCode = async () => {
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Indiquez votre prénom et votre nom.");
    if (!allDone) return setError("Remplissez d'abord chaque champ du document.");
    if (!accepted) return setError("Cochez la case d'acceptation pour continuer.");
    setBusy(true);
    try {
      // Les champs cliqués, page par page (horodatés) : le serveur vérifie que
      // chaque page est paraphée et les inscrit au certificat — comme côté client.
      const d = await post<{ sentTo: string }>(`/api/admin/contracts/${contractId}/countersign`, {
        ...form,
        consent: true,
        confirmations: info?.plan ? confirmationsFrom(info.plan, clicked) : [],
      });
      setSentTo(d.sentTo);
      setCode("");
      setStep("code");
    } catch (e) {
      const err = e as Error & { code?: string };
      // Des pages manquent (selon le serveur) : retour au document, message à l'appui.
      if (err.code === "pages_missing") setStep("document");
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (busyRef.current || step === "done") return;
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError("Saisissez les 6 chiffres du code.");
    busyRef.current = true;
    setBusy(true);
    try {
      const d = await post<{ url: string | null; clientNotified: boolean }>(
        `/api/admin/contracts/${contractId}/countersign/confirm`,
        { code, style },
      );
      setResult(d);
      setStep("done");
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "document_changed") {
        // Le PDF du client a changé : on recharge le plan et le document avant
        // de repartir, sinon on paraphait l'ancien. Les clics ne valent plus.
        try {
          const d = await fetchInfo(contractId);
          setInfo(d);
          resetFields();
          setAccepted(false);
        } catch (e2) {
          toast.error((e2 as Error).message);
          return onClose();
        }
      }
      if (RESTART_ON.includes(err.code ?? "")) setStep("form");
      setError(err.message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const close = () => (step === "done" ? onDone() : onClose());

  // Échap ferme, sauf pendant un envoi ; lu par une ref pour ne pas réabonner
  // l'écouteur à chaque rendu.
  const escRef = useRef(close);
  useEffect(() => {
    escRef.current = () => !busy && !busyRef.current && close();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && escRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const name = `${form.firstName} ${form.lastName}`.trim() || "Votre nom";
  const actions = info?.plan?.fields.filter(isActionField) ?? [];
  const doneCount = actions.filter((f) => clicked[f.id]).length;
  const allDone = actions.length === 0 || doneCount === actions.length;

  const toDocument = () => {
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Indiquez votre prénom et votre nom.");
    setStep("document");
  };

  return createPortal(
    <div className="ctr-drawer" onClick={() => !busy && close()}>
      <div
        className="ctr-drawer__panel ctr-cs"
        role="dialog"
        aria-modal="true"
        aria-label={`Contresigner le contrat ${info?.reference ?? ""}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ctr-drawer__head">
          <div>
            <p className="ctr-editor__eyebrow">Contresigner · {info?.reference ?? "…"}</p>
            <h2>Signature de TIM</h2>
          </div>
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={close} disabled={busy}>
            Fermer
          </button>
        </header>
        <div className="ctr-cs__body">
          <div className="ctr-cs__doc">
            {info && step === "document" && info.plan ? (
              <PdfSigner
                url={info.signedUrl}
                plan={info.plan}
                clicked={clicked}
                onToggle={toggleField}
                onFinish={() => document.getElementById("ctr-cs-consent")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                initials={initialsOf(form.firstName, form.lastName)}
                fullName={name}
                role={form.role}
                fontClass={SIGNATURE_FONT_CLASS[style]}
                focus={focus}
              />
            ) : info ? (
              <iframe className="ctr-drawer__frame" src={viewerUrl(info.signedUrl)} title="Contrat signé par le client" />
            ) : (
              <div className="ctr-editor__placeholder">Chargement…</div>
            )}
          </div>
          <div className="ctr-cs__side">
            {step === "form" && info && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  toDocument();
                }}
              >
                <h3 className="ctr-card__title">Vos coordonnées</h3>
                <p className="ctr-card__sub">Elles figurent dans le bloc « Le Prestataire » et le certificat.</p>
                <div className="ctr-grid ctr-grid--one">
                  <label className="ctr-field">
                    <span className="ctr-field__label">Prénom</span>
                    <input className="ctr-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  </label>
                  <label className="ctr-field">
                    <span className="ctr-field__label">Nom</span>
                    <input className="ctr-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                  </label>
                  <label className="ctr-field">
                    <span className="ctr-field__label">Fonction</span>
                    <input className="ctr-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
                  </label>
                </div>
                <p className="ctr-field__label ctr-cs__legend" id="ctr-cs-style-legend">
                  Votre signature
                </p>
                <SignatureStylePicker
                  aria-labelledby="ctr-cs-style-legend"
                  value={style}
                  onChange={setStyle}
                  name={name}
                  className="ctr-cs__styles"
                  itemClassName={(on) => `ctr-cs__style${on ? " is-on" : ""}`}
                />
                <button type="submit" className="ctr-btn ctr-btn--primary ctr-cs__cta">
                  Continuer : parapher et signer →
                </button>
              </form>
            )}

            {step === "document" && info && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void requestCode();
                }}
              >
                <h3 className="ctr-card__title">Parapher et signer</h3>
                <p className="ctr-card__sub">
                  Cliquez sur chaque étiquette jaune : vos initiales à droite de celles du client, votre signature dans
                  le bloc « Le Prestataire ». « Champ suivant » vous y mène.
                </p>
                <p className="ctr-field__label ctr-cs__legend">
                  {doneCount} / {actions.length} champ{actions.length > 1 ? "s" : ""} rempli{doneCount > 1 ? "s" : ""}
                </p>
                {info.plan ? (
                  <FieldChecklist
                    plan={info.plan}
                    clicked={clicked}
                    onGo={(id) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }))}
                  />
                ) : null}
                {allDone ? (
                  <>
                    <label className="ctr-cs__consent" id="ctr-cs-consent">
                      <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                      <span>{info.consent}</span>
                    </label>
                    <button type="submit" className="ctr-btn ctr-btn--primary ctr-cs__cta" disabled={busy}>
                      {busy ? "Envoi du code…" : `Recevoir mon code (${info.sentTo})`}
                    </button>
                  </>
                ) : null}
                <button type="button" className="ctr-link ctr-cs__back" onClick={() => setStep("form")}>
                  ← Modifier mes coordonnées
                </button>
              </form>
            )}

            {step === "code" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void confirm();
                }}
              >
                <h3 className="ctr-card__title">Saisissez votre code</h3>
                <p className="ctr-card__sub">Envoyé à {sentTo}. Valable 10 minutes.</p>
                <CodeInput inputRef={codeRef} className="ctr-cs__code" value={code} onChange={setCode} />
                <button type="submit" className="ctr-btn ctr-btn--primary ctr-cs__cta" disabled={busy || code.length !== 6}>
                  {busy ? "Contresignature…" : "Contresigner le contrat"}
                </button>
                <p className="ctr-card__sub">La saisie du code vaut signature.</p>
                <button type="button" className="ctr-link" onClick={() => setStep("document")}>
                  ← Retour au document
                </button>
              </form>
            )}

            {step === "done" && result && (
              <div className="ctr-cs__done">
                <div className="ctr-ready">
                  <p className="ctr-ready__title">Contrat signé par les deux parties</p>
                  <p>
                    {result.clientNotified
                      ? "Le client reçoit son exemplaire par e-mail ; il est aussi disponible dans son espace."
                      : "L'exemplaire est disponible dans l'espace du client."}
                  </p>
                </div>
                {result.url ? (
                  <a className="ctr-btn ctr-btn--ghost ctr-cs__cta" href={result.url} target="_blank" rel="noreferrer">
                    Voir le contrat final
                  </a>
                ) : null}
                <button type="button" className="ctr-btn ctr-btn--primary ctr-cs__cta" onClick={onDone}>
                  Terminer
                </button>
              </div>
            )}

            {error ? <p className="ctr-note ctr-cs__error">{error}</p> : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
