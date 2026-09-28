"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { downloadUrl } from "@/components/portal/DocumentPreview";
import { SIGNATURE_FONT_CLASS } from "@/components/portal/signature-fonts";
import { CodeInput } from "@/components/signing/CodeInput";
import { FieldChecklist } from "@/components/signing/FieldChecklist";
import { PdfSigner } from "@/components/signing/PdfSigner";
import { SignatureStylePicker } from "@/components/signing/SignatureStylePicker";
import { useClickedFields } from "@/components/signing/useClickedFields";
import { IconCheck, IconCross, IconDownload, IconMail, IconPen } from "@/components/ui/icons";
import { confirmationsFrom, isActionField, type SignPlan } from "@/modules/partner/lib/sign-fields";
import { initialsOf, type SignatureStyle } from "@/modules/partner/lib/signature-styles";

/**
 * Signer en ligne : le document à gauche, la signature à droite.
 *
 * Quatre temps, un seul visible à la fois :
 *   1. Vos coordonnées — prénom, nom, fonction, rendu de la signature ;
 *   2. Le document, façon DocuSign — des étiquettes « Parapher » / « Signer »
 *      posées aux endroits exacts, remplies d'un clic (« Champ suivant » y
 *      mène) ; puis l'acceptation explicite et la demande du code ;
 *   3. Le code — reçu par e-mail, six chiffres, qui VAUT signature ;
 *   4. C'est signé — la copie à télécharger, et la suite.
 *
 * Le document reste sous les yeux pendant toute la signature : on signe ce
 * qu'on voit. Sur téléphone, il passe au-dessus, en hauteur réduite.
 *
 * Tout ce qui fait foi est côté serveur (routes /sign/start et /sign/confirm) ;
 * ce composant ne décide de rien, il guide.
 */

export type SignerDefaults = { firstName: string; lastName: string; role: string };
/** Les champs à remplir, page par page ; calculé côté serveur (sign-fields). */
export type PagePlan = SignPlan;

const RESEND_AFTER_S = 30;

export function SignDrawer({
  open,
  kind,
  document: doc,
  consent,
  signer,
  pagePlan,
  onClose,
  onSigned,
}: {
  /** null : le document n'a pas pu être lu, on signe sans parapher page à page. */
  pagePlan: PagePlan | null;
  open: boolean;
  kind: "devis" | "contrat";
  document: { url: string; filename?: string | null; mime?: string | null };
  consent: string;
  signer: SignerDefaults;
  onClose: () => void;
  /** Fermeture après signature : la page passe à l'étape suivante. */
  onSigned: () => void;
}) {
  const noun = kind === "devis" ? "devis" : "contrat";
  const [shown, setShown] = useState(false);
  const [step, setStep] = useState<"form" | "pages" | "code" | "done">("form");
  /** Champs remplis → horodatage du clic. */
  const { clicked, toggleField } = useClickedFields();
  const consentRef = useRef<HTMLLabelElement>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [form, setForm] = useState<SignerDefaults>(signer);
  const [accepted, setAccepted] = useState(false);
  const [style, setStyle] = useState<SignatureStyle>("elegante");
  const [code, setCode] = useState("");
  const [sig, setSig] = useState<{ id: number | string; sentTo: string } | null>(null);
  const [signed, setSigned] = useState<{ url: string | null; reference: string; awaiting?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const close = () => (step === "done" ? onSigned() : onClose());

  // Échap lit l'état du moment par des refs : l'effet d'ouverture ne dépend
  // que de `open`, sinon le panneau ressortait et rentrait à chaque envoi.
  const busyRef = useRef(busy);
  const closeRef = useRef(close);
  useEffect(() => {
    busyRef.current = busy;
    closeRef.current = close;
  });

  // Entrée animée, Échap, page figée derrière.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busyRef.current && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      setShown(false);
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Compte à rebours avant de pouvoir redemander un code.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const requestCode = async () => {
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Indiquez votre prénom et votre nom.");
    if (!accepted) return setError("Cochez la case d'acceptation pour continuer.");
    setBusy(true);
    try {
      const res = await fetch("/api/portal/signature/sign/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          ...form,
          consent: true,
          confirmations: pagePlan ? confirmationsFrom(pagePlan, clicked) : [],
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { id?: number; sentTo?: string; message?: string; error?: string; missing?: number[] }
        | null;
      if (data?.error === "pages_missing") setStep("pages");
      if (!res.ok || data?.id == null) throw new Error(data?.message || "Le code n'a pas pu être envoyé. Réessayez.");
      setSig({ id: data.id, sentTo: data.sentTo ?? "votre adresse e-mail" });
      setCode("");
      setWait(RESEND_AFTER_S);
      setStep("code");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const count = pagePlan?.count ?? 0;
  const actionFields = pagePlan?.fields.filter(isActionField) ?? [];
  const doneCount = actionFields.filter((f) => clicked[f.id]).length;
  // Même règle que la contresignature : un plan sans champ à cliquer est complet.
  const allDone = actionFields.length === 0 || doneCount === actionFields.length;
  const initials = initialsOf(form.firstName, form.lastName);
  const fullName = `${form.firstName} ${form.lastName}`.trim();

  /** Coordonnées validées → le document (ou directement le code, sans plan). */
  const toPages = () => {
    setError(null);
    if (!form.firstName.trim() || !form.lastName.trim()) return setError("Indiquez votre prénom et votre nom.");
    if (!pagePlan) return void requestCode();
    setStep("pages");
  };

  const confirm = async () => {
    // Double clic : le second partirait avant le rendu qui grise le bouton, et
    // son refus (code déjà utilisé) renverrait au début un panneau déjà signé.
    if (!sig || busyRef.current || step === "done") return;
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError("Saisissez les 6 chiffres du code.");
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/portal/signature/sign/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sig.id, code, style }),
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string | null; reference?: string; message?: string; error?: string; awaitingCountersign?: boolean }
        | null;
      if (!res.ok) {
        // Code expiré, trop d'essais, document changé : on repart du début.
        if (["expired", "locked", "document_changed"].includes(data?.error ?? "")) setStep("form");
        throw new Error(data?.message || "La signature n'a pas abouti. Réessayez.");
      }
      setSigned({ url: data?.url ?? null, reference: data?.reference ?? "", awaiting: data?.awaitingCountersign === true });
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!open || typeof window === "undefined") return null;

  const input =
    "mt-1.5 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-light";

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Signer votre ${noun}`}>
      <div
        className={`absolute inset-0 bg-foreground/40 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={() => !busy && close()}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-out lg:max-w-6xl ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
            <IconPen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Signer votre {noun}</p>
            {doc.filename && <p className="truncate text-sm text-muted">{doc.filename}</p>}
          </div>
          <a
            href={downloadUrl(doc.url)}
            className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-surface sm:inline-flex"
          >
            <IconDownload className="h-4 w-4" /> Télécharger
          </a>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Fermer"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition hover:bg-surface hover:text-foreground disabled:opacity-50"
          >
            <IconCross className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Le document, sous les yeux pendant toute la signature. */}
          <div className={`relative shrink-0 bg-surface lg:h-auto lg:flex-1 ${step === "pages" ? "h-[62vh]" : "h-[38vh]"}`}>
            {step === "pages" && pagePlan ? (
              <PdfSigner
                url={doc.url}
                mime={doc.mime ?? undefined}
                plan={pagePlan}
                clicked={clicked}
                onToggle={toggleField}
                onFinish={() => consentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                finishLabel="Terminer"
                initials={initials}
                fullName={fullName}
                role={form.role}
                fontClass={SIGNATURE_FONT_CLASS[style]}
                focus={focus}
              />
            ) : (
              <iframe src={`${doc.url}#navpanes=0&view=FitH`} title={`Votre ${noun}`} className="absolute inset-0 h-full w-full" />
            )}
          </div>

          {/* La signature. */}
          <div className="flex min-h-0 flex-col overflow-y-auto border-t border-border lg:w-[400px] lg:border-l lg:border-t-0">
            <div className="flex-1 p-6">
              {/* Repère des trois temps */}
              {/* Compact : seule l'étape en cours porte son libellé — quatre
                  libellés ne tiennent pas dans la colonne. */}
              <ol className="mb-6 flex items-center gap-1.5 text-xs font-semibold" aria-label="Étapes de la signature">
                {[
                  { k: "form", l: "Coordonnées" },
                  ...(pagePlan ? [{ k: "pages", l: "Document" }] : []),
                  { k: "code", l: "Code" },
                  { k: "done", l: "Signé" },
                ].map((s, i, all) => {
                  const idx = all.findIndex((x) => x.k === step);
                  const state = i < idx ? "done" : i === idx ? "active" : "todo";
                  return (
                    <li key={s.k} className="flex min-w-0 items-center gap-1.5" title={s.l}>
                      <span
                        aria-label={`${s.l}${state === "done" ? " (fait)" : ""}`}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                          state === "done"
                            ? "bg-success text-white"
                            : state === "active"
                              ? "bg-primary text-white"
                              : "border border-primary text-primary"
                        }`}
                      >
                        {state === "done" ? <IconCheck className="h-3 w-3" /> : i + 1}
                      </span>
                      {state === "active" && <span className="whitespace-nowrap text-primary">{s.l}</span>}
                      {i < all.length - 1 && <span className="h-px w-4 shrink-0 bg-border" aria-hidden />}
                    </li>
                  );
                })}
              </ol>

              {step === "form" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    toPages();
                  }}
                >
                  <h3 className="text-lg font-bold text-foreground">Vos coordonnées</h3>
                  <p className="mt-1 text-sm text-muted">Elles figureront sur le certificat de signature.</p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-sm font-semibold text-foreground">Prénom</span>
                      <input className={input} value={form.firstName} autoComplete="given-name" onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-foreground">Nom</span>
                      <input className={input} value={form.lastName} autoComplete="family-name" onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                    </label>
                    <label className="col-span-2 block">
                      <span className="text-sm font-semibold text-foreground">
                        Fonction <span className="font-normal text-muted">(facultatif)</span>
                      </span>
                      <input className={input} value={form.role} placeholder="Gérant, directeur…" autoComplete="organization-title" onChange={(e) => setForm({ ...form, role: e.target.value })} />
                    </label>
                  </div>
                  {/* Le rendu de la signature : trois aperçus du nom, en direct.
                      Une apparence, pas une preuve — le procédé fait foi. */}
                  <fieldset className="mt-5">
                    <legend id="sign-style-legend" className="text-sm font-semibold text-foreground">
                      Votre signature
                    </legend>
                    <SignatureStylePicker
                      aria-labelledby="sign-style-legend"
                      value={style}
                      onChange={setStyle}
                      name={fullName || "Votre nom"}
                      className="mt-2 flex flex-col gap-1.5"
                      itemClassName={(on) =>
                        `flex items-center justify-between gap-3 rounded-lg border px-3 py-1 text-left transition ${
                          on ? "border-primary bg-primary-light" : "border-border hover:border-primary"
                        }`
                      }
                      nameClassName="truncate text-xl leading-snug text-foreground"
                      mark={(on) => (
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            on ? "border-primary bg-primary text-white" : "border-border"
                          }`}
                          aria-hidden
                        >
                          {on && <IconCheck className="h-2.5 w-2.5" />}
                        </span>
                      )}
                    />
                  </fieldset>

                  {pagePlan ? (
                    <button
                      type="submit"
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-white transition hover:bg-primary-dark"
                    >
                      Continuer : parapher et signer →
                    </button>
                  ) : (
                    <>
                      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg bg-surface p-3">
                        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]" />
                        <span className="text-sm text-foreground">{consent}</span>
                      </label>
                      <button
                        type="submit"
                        disabled={busy}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
                      >
                        <IconMail className="h-5 w-5" />
                        {busy ? "Envoi du code…" : "Recevoir mon code par e-mail"}
                      </button>
                    </>
                  )}
                </form>
              )}

              {step === "pages" && pagePlan && (
                <div>
                  <h3 className="text-lg font-bold text-foreground">Parapher et signer</h3>
                  <p className="mt-1 text-sm text-muted">
                    Relisez le document. Cliquez sur chaque étiquette jaune pour y apposer vos initiales, ou votre
                    signature là où elle est demandée. « Champ suivant » vous y mène.
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs font-semibold">
                    <span className="text-foreground">
                      {doneCount} / {actionFields.length} champ{actionFields.length > 1 ? "s" : ""} rempli{doneCount > 1 ? "s" : ""}
                    </span>
                    {allDone && <span className="text-success-text">Tout est rempli</span>}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-success transition-all duration-300"
                      style={{ width: `${actionFields.length ? (doneCount / actionFields.length) * 100 : 0}%` }}
                    />
                  </div>
                  <FieldChecklist
                    plan={pagePlan}
                    clicked={clicked}
                    onGo={(id) => setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }))}
                  />
                  <p className="mt-3 text-xs text-muted">
                    {count} page{count > 1 ? "s" : ""}
                    {pagePlan.signaturePages.length
                      ? ` · signature page${pagePlan.signaturePages.length > 1 ? "s" : ""} ${pagePlan.signaturePages.join(" et ")}`
                      : ""}
                    . Un second clic sur un champ rempli l&apos;annule.
                  </p>

                  {allDone && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void requestCode();
                      }}
                    >
                      <label ref={consentRef} className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg bg-surface p-3">
                        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]" />
                        <span className="text-sm text-foreground">{consent}</span>
                      </label>
                      <button
                        type="submit"
                        disabled={busy}
                        className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
                      >
                        <IconMail className="h-5 w-5" />
                        {busy ? "Envoi du code…" : "Recevoir mon code par e-mail"}
                      </button>
                    </form>
                  )}

                  <button type="button" onClick={() => setStep("form")} className="mt-5 text-sm text-muted hover:text-foreground">
                    ← Modifier mes coordonnées
                  </button>
                </div>
              )}

              {step === "code" && sig && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void confirm();
                  }}
                >
                  <h3 className="text-lg font-bold text-foreground">Saisissez votre code</h3>
                  <p className="mt-1 text-sm text-muted">
                    Envoyé à <strong className="text-foreground">{sig.sentTo}</strong>. Valable 10 minutes.
                  </p>
                  <CodeInput
                    inputRef={codeRef}
                    value={code}
                    onChange={setCode}
                    className="mt-5 w-full rounded-xl border-2 border-border bg-white py-4 text-center font-mono text-3xl tracking-[0.5em] text-foreground outline-none transition focus:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={busy || code.length !== 6}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-60"
                  >
                    <IconPen className="h-5 w-5" />
                    {busy ? "Signature…" : `Signer le ${noun}`}
                  </button>
                  <p className="mt-3 text-center text-xs text-muted">La saisie du code vaut signature.</p>
                  <div className="mt-5 flex items-center justify-between text-sm">
                    <button type="button" onClick={() => setStep(pagePlan ? "pages" : "form")} className="text-muted hover:text-foreground">
                      ← Retour
                    </button>
                    <button
                      type="button"
                      disabled={wait > 0 || busy}
                      onClick={() => void requestCode()}
                      className="font-semibold text-primary disabled:text-muted"
                    >
                      {wait > 0 ? `Renvoyer (${wait} s)` : "Renvoyer un code"}
                    </button>
                  </div>
                </form>
              )}

              {step === "done" && signed && (
                <div className="flex flex-col items-center pt-4 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success-text">
                    <IconCheck className="h-8 w-8" />
                  </span>
                  <h3 className="mt-4 text-xl font-bold text-foreground">
                    {signed.awaiting ? `Votre signature est enregistrée` : `Votre ${noun} est signé`}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {signed.awaiting
                      ? "TIM le contresigne à son tour : vous recevrez votre exemplaire signé par les deux parties par e-mail."
                      : "Une copie avec son certificat vous a été envoyée par e-mail."}
                    {signed.reference ? ` Référence ${signed.reference}.` : ""}
                  </p>
                  {signed.url && (
                    <a
                      href={downloadUrl(signed.url)}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-5 py-3 font-semibold text-foreground transition hover:bg-surface"
                    >
                      <IconDownload className="h-5 w-5" /> Télécharger le {noun} signé
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={onSigned}
                    className="mt-3 w-full rounded-lg bg-success px-5 py-3 font-semibold text-white transition hover:opacity-90"
                  >
                    {kind === "devis" ? "Continuer vers le contrat" : "Terminer"}
                  </button>
                </div>
              )}

              {error && <p className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-foreground">{error}</p>}
            </div>

            <p className="border-t border-border px-6 py-3 text-center text-xs text-muted">
              Signature électronique horodatée, avec certificat — signature simple au sens du règlement eIDAS.
            </p>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
