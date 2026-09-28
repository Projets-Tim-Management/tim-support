"use client";

import { toast, useDocumentInfo, useFormModified } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { frDate } from "@/core/lib/dates";
import { adminApi as api, viewerUrl } from "@/modules/partner/admin/contract-api";
import { CountersignDrawer } from "@/modules/partner/admin/CountersignDrawer";
import { SIGNED_CONTRACT_STATUSES } from "@/modules/partner/lib/contract-status";

/**
 * Onglet « Signature » → le contrat généré.
 *
 * « Préparer le contrat » ouvre un parcours en trois étapes :
 *   1. Informations — conditions commerciales et variables du contrat,
 *      préremplies depuis la fiche ; ce qu'on y change ne vaut que pour CE
 *      contrat (la fiche du client reste telle quelle) ;
 *   2. Texte — personnaliser une section pour ce client (le modèle reste intact) ;
 *   3. Relecture et envoi — le PDF final, les manques, l'envoi au client.
 *
 * Seul TIM prépare et envoie ; le partenaire voit l'état et l'historique.
 */

type Missing = { name: string; label: string; where: string };
type ContractRow = {
  id: number | string;
  reference: string;
  version: number;
  status: string;
  customSections: number;
  sentAt: string | null;
  clientSignedAt: string | null;
  pdfUrl: string | null;
  signedUrl: string | null;
};
type Section = { key: string; title: string; kind: string; body: string };
type InfoField = {
  name: string;
  label: string;
  bool: boolean;
  source: string | boolean | null;
  value: string | boolean | null;
  overridden: boolean;
};
type ContractParams = {
  contractStartDate?: string | null;
  engagementMonths?: string | null;
  preferentialYears?: number | null;
  integrationFee?: number | null;
  integrationOffered?: boolean | null;
  contractTerritory?: string | null;
};
type Detail = {
  contract: { id: number | string; reference: string; version: number; status: string; clientName: string | null };
  params: ContractParams;
  engagementOptions: { label: string; value: string }[];
  info: { title: string; fields: InfoField[] }[];
  sections: Section[];
  overrides: Record<string, string>;
  missing: Missing[];
  variables: string[];
};
type DraftVars = Record<string, string | boolean>;

const STATUS: Record<string, { label: string; tone: string }> = {
  brouillon: { label: "En préparation", tone: "slate" },
  envoye: { label: "Envoyé au client", tone: "sky" },
  "signe-client": { label: "À contresigner", tone: "amber" },
  signe: { label: "Signé", tone: "green" },
  remplace: { label: "Remplacé", tone: "gray" },
  annule: { label: "Annulé", tone: "gray" },
};

const STEPS = ["Informations", "Texte", "Relecture et envoi"] as const;

/** Le PDF d'un brouillon (avec les modifications en cours) → URL locale. */
async function pdfBlobUrl(id: number | string, draft?: object, final = false): Promise<string> {
  const res = await fetch(`/api/admin/contracts/${id}/pdf${final ? "?final=1" : ""}`, {
    method: draft ? "POST" : "GET",
    credentials: "include",
    headers: draft ? { "Content-Type": "application/json" } : undefined,
    body: draft ? JSON.stringify(draft) : undefined,
  });
  if (!res.ok) throw new Error("Aperçu indisponible");
  return URL.createObjectURL(await res.blob());
}

/** Aperçu du PDF dans un panneau latéral. */
function PreviewDrawer({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="ctr-drawer" onClick={onClose}>
      <div
        className="ctr-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Aperçu — ${title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ctr-drawer__head">
          <h2>{title}</h2>
          <div className="ctr-drawer__actions">
            <a className="ctr-btn ctr-btn--ghost" href={url} download={`${title}.pdf`}>
              Télécharger
            </a>
            <button type="button" className="ctr-btn ctr-btn--ghost" onClick={onClose}>
              Fermer
            </button>
          </div>
        </header>
        <iframe className="ctr-drawer__frame" src={viewerUrl(url)} title={title} />
      </div>
    </div>,
    document.body,
  );
}

/* ─── Étape 1 : informations ─────────────────────────────────────────────── */

function InfoInput({
  field,
  draft,
  onChange,
}: {
  field: InfoField;
  draft: DraftVars;
  onChange: (name: string, value: string | boolean | undefined) => void;
}) {
  const overridden = field.name in draft;
  const source = typeof field.source === "string" ? field.source : "";
  const value = overridden ? String(draft[field.name]) : source;
  const empty = !value.trim();
  const set = (v: string) => onChange(field.name, v === source ? undefined : v);
  return (
    <label className={`ctr-field${empty ? " is-empty" : ""}${overridden ? " is-overridden" : ""}`}>
      <span className="ctr-field__label">
        {field.label}
        {overridden ? <em className="ctr-tag ctr-tag--amber">Modifié pour ce contrat</em> : null}
        {empty && !overridden ? <em className="ctr-tag ctr-tag--amber">À compléter</em> : null}
      </span>
      <input className="ctr-input" value={value} onChange={(e) => set(e.target.value)} />
      {overridden ? (
        <span className="ctr-field__hint">
          Fiche : {source ? `« ${source} »` : "vide"} ·{" "}
          <button type="button" className="ctr-link" onClick={() => onChange(field.name, undefined)}>
            Reprendre la valeur de la fiche
          </button>
        </span>
      ) : null}
    </label>
  );
}

function InfoStep({
  detail,
  params,
  setParams,
  vars,
  setVar,
}: {
  detail: Detail;
  params: ContractParams;
  setParams: (p: ContractParams) => void;
  vars: DraftVars;
  setVar: (name: string, value: string | boolean | undefined) => void;
}) {
  const p = (patch: ContractParams) => setParams({ ...params, ...patch });
  const clientGroup = detail.info.find((g) => g.title === "Le client");
  const conditions = detail.info.find((g) => g.title === "Conditions commerciales");
  const others = detail.info.filter((g) => g.title !== "Le client" && g.title !== "Conditions commerciales");
  const feeSet = params.integrationOffered === true || params.integrationFee != null;

  const inputs = (fields: InfoField[]) =>
    fields.map((f) => <InfoInput key={f.name} field={f} draft={vars} onChange={setVar} />);

  const card = (title: string, children: React.ReactNode, sub?: string) => (
    <section className="ctr-card" key={title}>
      <h3 className="ctr-card__title">{title}</h3>
      {sub ? <p className="ctr-card__sub">{sub}</p> : null}
      <div className="ctr-grid">{children}</div>
    </section>
  );

  return (
    <div className="ctr-step">
      <p className="ctr-intro">
        Tout est prérempli depuis la fiche et les pages Système. Ce que vous modifiez ici ne vaut que pour ce
        contrat : <strong>la fiche du client ne change pas</strong>.
      </p>

      {clientGroup ? card("Le client", inputs(clientGroup.fields), "Depuis la fiche → Facturation client.") : null}

      {card(
        "Conditions commerciales",
        <>
          <label className="ctr-field">
            <span className="ctr-field__label">Date de début du contrat</span>
            <input
              className="ctr-input"
              type="date"
              value={params.contractStartDate ?? ""}
              onChange={(e) => p({ contractStartDate: e.target.value || null })}
            />
            <span className="ctr-field__hint">
              Peut différer de la signature. Vide = le contrat prend effet à sa signature.
            </span>
          </label>
          <label className={`ctr-field${params.engagementMonths ? "" : " is-empty"}`}>
            <span className="ctr-field__label">
              Durée d'engagement
              {params.engagementMonths ? null : <em className="ctr-tag ctr-tag--amber">À compléter</em>}
            </span>
            <select
              className="ctr-input"
              value={params.engagementMonths ?? ""}
              onChange={(e) => p({ engagementMonths: e.target.value || null })}
            >
              <option value="">Choisir…</option>
              {detail.engagementOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="ctr-field">
            <span className="ctr-field__label">Tarif préférentiel (années)</span>
            <input
              className="ctr-input"
              type="number"
              min={0}
              value={params.preferentialYears ?? ""}
              placeholder="Aucun"
              onChange={(e) => p({ preferentialYears: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <span className="ctr-field__hint">Vide = pas de clause de tarif préférentiel.</span>
          </label>
          <div className={`ctr-field${feeSet ? "" : " is-empty"}`}>
            <span className="ctr-field__label">
              Frais d'intégration (€ HT)
              {feeSet ? null : <em className="ctr-tag ctr-tag--amber">À compléter</em>}
            </span>
            <input
              className="ctr-input"
              type="number"
              min={0}
              value={params.integrationFee ?? ""}
              disabled={params.integrationOffered === true}
              aria-label="Frais d'intégration (€ HT)"
              onChange={(e) => p({ integrationFee: e.target.value === "" ? null : Number(e.target.value) })}
            />
            <label className="ctr-check">
              <input
                type="checkbox"
                checked={params.integrationOffered === true}
                onChange={(e) => p({ integrationOffered: e.target.checked })}
              />
              Offerts au client
            </label>
          </div>
          <label className="ctr-field">
            <span className="ctr-field__label">Territoire</span>
            <input
              className="ctr-input"
              value={params.contractTerritory ?? ""}
              placeholder="France"
              onChange={(e) => p({ contractTerritory: e.target.value || null })}
            />
          </label>
          {conditions ? inputs(conditions.fields) : null}
        </>,
        "Propres à ce contrat.",
      )}

      {others.map((g) =>
        card(g.title, inputs(g.fields), g.title === "Le prestataire" ? "Depuis Système → Entreprise." : undefined),
      )}
    </div>
  );
}

/* ─── Étape 2 : texte ────────────────────────────────────────────────────── */

function TextStep({
  detail,
  drafts,
  setDrafts,
  previewDraft,
}: {
  detail: Detail;
  drafts: Record<string, string>;
  setDrafts: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  previewDraft: object;
}) {
  const [current, setCurrent] = useState(detail.sections[0]?.key ?? "");
  const [pdf, setPdf] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // Le dernier aperçu (URL locale) et l'état monté : libéré en quittant
  // l'étape, jamais créé après.
  const pdfRef = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pdfRef.current) URL.revokeObjectURL(pdfRef.current);
      pdfRef.current = null;
    };
  }, []);

  const section = detail.sections.find((s) => s.key === current);
  const custom = typeof drafts[current] === "string";
  const text = custom ? drafts[current] : (section?.body ?? "");

  const refresh = useCallback(async () => {
    setPreviewing(true);
    try {
      const url = await pdfBlobUrl(detail.contract.id, previewDraft);
      if (!mounted.current) return URL.revokeObjectURL(url);
      if (pdfRef.current) URL.revokeObjectURL(pdfRef.current);
      pdfRef.current = url;
      setPdf(url);
    } catch {
      if (mounted.current) toast.error("L'aperçu n'a pas pu être généré.");
    } finally {
      if (mounted.current) setPreviewing(false);
    }
  }, [detail.contract.id, previewDraft]);

  useEffect(() => {
    void refresh();
    // Premier aperçu à l'arrivée sur l'étape ; ensuite, à la demande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (value: string) => {
    if (!section) return;
    setDrafts((d) => {
      const next = { ...d };
      // Retaper exactement le texte du modèle, c'est revenir au modèle.
      if (value === section.body) delete next[section.key];
      else next[section.key] = value;
      return next;
    });
  };

  const insertVar = (name: string) => {
    const el = textRef.current;
    const token = `{{${name}}}`;
    if (!el) return edit(text + token);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    edit(text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="ctr-editor__body">
      <nav className="ctr-editor__nav" aria-label="Sections du contrat">
        {detail.sections.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`ctr-editor__sec${s.key === current ? " is-current" : ""}`}
            onClick={() => setCurrent(s.key)}
          >
            <span>{s.title || "Préambule"}</span>
            {typeof drafts[s.key] === "string" ? <em className="ctr-tag ctr-tag--amber">Personnalisé</em> : null}
          </button>
        ))}
      </nav>

      <section className="ctr-editor__main">
        <div className="ctr-editor__bar">
          <span className="ctr-editor__label">{section?.title || "Préambule"}</span>
          <div className="ctr-editor__tools">
            <select
              className="ctr-select"
              value=""
              onChange={(e) => e.target.value && insertVar(e.target.value)}
              aria-label="Insérer une variable"
            >
              <option value="">Insérer une variable…</option>
              {detail.variables.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="ctr-btn ctr-btn--ghost"
              disabled={!custom}
              onClick={() => section && edit(section.body)}
            >
              Revenir au modèle
            </button>
          </div>
        </div>
        {custom ? (
          <p className="ctr-editor__state ctr-editor__state--custom">Section personnalisée pour ce client</p>
        ) : (
          <p className="ctr-editor__state">Texte du modèle — le modifier ne change que ce contrat</p>
        )}
        <textarea
          ref={textRef}
          className="ctr-editor__text"
          value={text}
          onChange={(e) => edit(e.target.value)}
          spellCheck
        />
        <p className="ctr-editor__hint">
          Ligne vide = nouveau paragraphe · <code>- </code> liste · <code>**gras**</code> ·{" "}
          <code>{"{{variable}}"}</code> remplie à l'étape Informations.
        </p>
      </section>

      <aside className="ctr-editor__preview">
        <div className="ctr-editor__bar">
          <span className="ctr-editor__label">Aperçu PDF</span>
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={refresh} disabled={previewing}>
            {previewing ? "Génération…" : "Actualiser l'aperçu"}
          </button>
        </div>
        {pdf ? (
          <iframe className="ctr-editor__frame" src={viewerUrl(pdf)} title="Aperçu du contrat" />
        ) : (
          <div className="ctr-editor__placeholder">Génération de l'aperçu…</div>
        )}
      </aside>
    </div>
  );
}

/* ─── Étape 3 : relecture et envoi ───────────────────────────────────────── */

function ReviewStep({ detail, customCount, onFix }: { detail: Detail; customCount: number; onFix: () => void }) {
  const [pdf, setPdf] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    // Le contrat tel qu'il partira : sans le surlignage de relecture.
    pdfBlobUrl(detail.contract.id, undefined, true)
      .then((u) => {
        // Arrivé après le départ de l'étape : libéré aussitôt.
        if (cancelled) return URL.revokeObjectURL(u);
        url = u;
        setPdf(u);
      })
      .catch(() => !cancelled && toast.error("L'aperçu n'a pas pu être généré."));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [detail]);

  const missing = detail.missing;
  return (
    <div className="ctr-review">
      <aside className="ctr-review__side">
        {missing.length ? (
          <div className="ctr-missing">
            <p className="ctr-missing__title">
              {missing.length === 1 ? "1 information manque" : `${missing.length} informations manquent`}
            </p>
            <ul>
              {missing.map((m) => (
                <li key={m.name}>
                  <strong>{m.label}</strong>
                </li>
              ))}
            </ul>
            <button type="button" className="ctr-btn ctr-btn--ghost ctr-missing__fix" onClick={onFix}>
              Compléter à l'étape Informations
            </button>
          </div>
        ) : (
          <div className="ctr-ready">
            <p className="ctr-ready__title">Prêt à envoyer</p>
            <p>Toutes les informations du contrat sont renseignées.</p>
          </div>
        )}
        <ul className="ctr-facts">
          <li>
            <span>Référence</span>
            <strong>{detail.contract.reference}</strong>
          </li>
          <li>
            <span>Sections personnalisées</span>
            <strong>{customCount || "Aucune"}</strong>
          </li>
        </ul>
        <p className="ctr-muted">
          À l'envoi, le PDF est figé et déposé dans l'espace du client, qui est prévenu par e-mail pour le signer en
          ligne. Tant qu'il n'a pas signé, vous pourrez le reprendre en préparation.
        </p>
      </aside>
      <div className="ctr-review__pdf">
        {pdf ? (
          <iframe className="ctr-editor__frame" src={viewerUrl(pdf)} title="Contrat à envoyer" />
        ) : (
          <div className="ctr-editor__placeholder">Génération du contrat…</div>
        )}
      </div>
    </div>
  );
}

/* ─── Le parcours ────────────────────────────────────────────────────────── */

function ContractWizard({
  contractId,
  onClose,
  onChanged,
}: {
  contractId: number | string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [step, setStep] = useState(0);
  const [params, setParams] = useState<ContractParams>({});
  const [vars, setVars] = useState<DraftVars>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const snapshot = (p: ContractParams, v: DraftVars, d: Record<string, string>) => JSON.stringify({ p, v, d });

  const reload = useCallback(async () => {
    const d = await api<Detail>(`/api/admin/contracts/${contractId}`);
    const v: DraftVars = {};
    for (const g of d.info) for (const f of g.fields) if (f.overridden && f.value !== null) v[f.name] = f.value;
    setDetail(d);
    setParams(d.params);
    setVars(v);
    setDrafts(d.overrides);
    setSaved(snapshot(d.params, v, d.overrides));
    return d;
  }, [contractId]);

  useEffect(() => {
    reload().catch((e) => toast.error((e as Error).message));
  }, [reload]);

  const dirty = detail !== null && snapshot(params, vars, drafts) !== saved;

  // Ce qui part au serveur : l'état complet de l'éditeur.
  const draftBody = useMemo(() => {
    const overrides: Record<string, string | null> = {};
    for (const s of detail?.sections ?? []) {
      if (typeof drafts[s.key] === "string") overrides[s.key] = drafts[s.key];
      else if (typeof detail?.overrides[s.key] === "string") overrides[s.key] = null;
    }
    return { overrides, params, variables: vars };
  }, [detail, drafts, params, vars]);

  const setVar = (name: string, value: string | boolean | undefined) =>
    setVars((v) => {
      const next = { ...v };
      if (value === undefined) delete next[name];
      else next[name] = value;
      return next;
    });

  const save = async (quiet = false) => {
    setBusy("save");
    try {
      await api(`/api/admin/contracts/${contractId}`, { method: "PATCH", body: JSON.stringify(draftBody) });
      await reload();
      onChanged();
      if (!quiet) toast.success("Contrat enregistré.");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const go = async (next: number) => {
    // La relecture montre le contrat tel qu'il partira : on enregistre d'abord.
    if (next === 2 && dirty && !(await save(true))) return;
    setStep(next);
  };

  const send = async () => {
    if (
      !window.confirm(
        "Envoyer ce contrat au client ?\n\nLe PDF est figé et déposé dans son espace, et il est prévenu par e-mail pour le signer en ligne.",
      )
    )
      return;
    setBusy("send");
    try {
      await api(`/api/admin/contracts/${contractId}/send`, { method: "POST" });
      toast.success("Contrat envoyé au client.");
      // La fiche a changé côté serveur (contrat à signer, date d'envoi).
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  const close = () => {
    if (dirty && !window.confirm("Quitter sans enregistrer vos modifications ?")) return;
    onClose();
  };

  const missingCount = detail?.missing.length ?? 0;

  return createPortal(
    <div
      className="ctr-editor"
      role="dialog"
      aria-modal="true"
      aria-label={`Préparer le contrat${detail ? ` ${detail.contract.reference}` : ""}`}
    >
      <header className="ctr-editor__head">
        <div className="ctr-editor__who">
          <p className="ctr-editor__eyebrow">Préparer le contrat · {detail?.contract.reference ?? "…"}</p>
          <h2 className="ctr-editor__title">{detail?.contract.clientName ?? "Contrat"}</h2>
        </div>
        <ol className="ctr-stepper">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                className={`ctr-stepper__step${i === step ? " is-current" : ""}${i < step ? " is-done" : ""}`}
                onClick={() => go(i)}
                disabled={!detail || busy !== null}
              >
                <span className="ctr-stepper__num">{i < step ? "✓" : i + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        <div className="ctr-editor__actions">
          {dirty ? <span className="ctr-editor__dirty">Non enregistré</span> : null}
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={() => save()} disabled={!dirty || busy !== null}>
            {busy === "save" ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={close}>
            Fermer
          </button>
        </div>
      </header>

      {!detail ? (
        <div className="ctr-editor__placeholder">Chargement du contrat…</div>
      ) : step === 0 ? (
        <div className="ctr-editor__scroll">
          <InfoStep detail={detail} params={params} setParams={setParams} vars={vars} setVar={setVar} />
        </div>
      ) : step === 1 ? (
        <TextStep detail={detail} drafts={drafts} setDrafts={setDrafts} previewDraft={draftBody} />
      ) : (
        <ReviewStep detail={detail} customCount={Object.keys(drafts).length} onFix={() => setStep(0)} />
      )}

      <footer className="ctr-editor__foot">
        {step > 0 ? (
          <button type="button" className="ctr-btn ctr-btn--ghost" onClick={() => go(step - 1)} disabled={busy !== null}>
            ← {STEPS[step - 1]}
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <button
            type="button"
            className="ctr-btn ctr-btn--primary"
            onClick={() => go(step + 1)}
            disabled={!detail || busy !== null}
          >
            Suivant : {STEPS[step + 1]} →
          </button>
        ) : (
          <button
            type="button"
            className="ctr-btn ctr-btn--primary"
            onClick={send}
            disabled={!detail || busy !== null || dirty || missingCount > 0}
            title={missingCount ? "Complétez d'abord les informations manquantes" : undefined}
          >
            {busy === "send" ? "Envoi…" : "Envoyer au client"}
          </button>
        )}
      </footer>
    </div>,
    document.body,
  );
}

/* ─── L'encart de la fiche ───────────────────────────────────────────────── */

export function ContractBox() {
  const { id } = useDocumentInfo();
  const modified = useFormModified();
  const [contracts, setContracts] = useState<ContractRow[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [editing, setEditing] = useState<number | string | null>(null);
  const [countersigning, setCountersigning] = useState<number | string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api<{ contracts: ContractRow[]; canEdit: boolean }>(`/api/admin/contracts?clientId=${id}`);
      setContracts(res.contracts);
      setCanEdit(res.canEdit);
      setLoadError(false);
      const draft = res.contracts.find((c) => c.status === "brouillon");
      if (draft && res.canEdit) {
        const d = await api<Detail>(`/api/admin/contracts/${draft.id}`);
        setMissingCount(d.missing.length);
      } else setMissingCount(null);
    } catch {
      setLoadError(true);
      setContracts([]);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id || contracts === null) return null;

  const current = contracts[0];
  const inForce = contracts.find((c) => SIGNED_CONTRACT_STATUSES.includes(c.status as never));
  // Dernière version annulée ou remplacée, mais un contrat antérieur toujours
  // en vigueur : c'est lui que l'encart montre ; l'annulée passe à l'historique.
  const shownInForce =
    current && (current.status === "annule" || current.status === "remplace") && inForce && inForce.id !== current.id
      ? inForce
      : null;
  const history = shownInForce ? contracts.filter((c) => c.id !== shownInForce.id) : contracts.slice(1);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /** Ouvre la préparation — en créant le brouillon s'il n'existe pas encore. */
  const prepare = () =>
    run("prepare", async () => {
      const draft = contracts.find((c) => c.status === "brouillon");
      if (draft) return setEditing(draft.id);
      const res = await api<{ id: number | string }>("/api/admin/contracts", {
        method: "POST",
        body: JSON.stringify({ clientId: id }),
      });
      await load();
      setEditing(res.id);
    });

  const openPreview = (row: ContractRow) =>
    run("preview", async () => {
      if (row.status !== "brouillon" && (row.signedUrl || row.pdfUrl)) {
        setPreview({ url: (row.signedUrl ?? row.pdfUrl)!, title: row.reference });
        return;
      }
      setPreview({ url: await pdfBlobUrl(row.id), title: row.reference });
    });

  const reopen = (row: ContractRow) =>
    run("reopen", async () => {
      if (
        !window.confirm(
          "Reprendre ce contrat en préparation ?\n\nIl est retiré de l'espace du client le temps de le corriger ; il sera prévenu au prochain envoi.",
        )
      )
        return;
      await api(`/api/admin/contracts/${row.id}/reopen`, { method: "POST" });
      window.location.reload();
    });

  const discard = (row: ContractRow) =>
    run("discard", async () => {
      if (!window.confirm("Abandonner ce contrat en préparation ?")) return;
      await api(`/api/admin/contracts/${row.id}`, { method: "DELETE" });
      await load();
    });

  /**
   * Annuler un contrat envoyé, ou signé par le client que TIM ne contresignera
   * pas : sans ce geste, il bloquait toute nouvelle version.
   */
  const cancel = (row: ContractRow) =>
    run("cancel", async () => {
      if (
        !window.confirm(
          `Annuler le contrat ${row.reference} ?\n\nLe contrat sera annulé et retiré de l'espace client ; vous pourrez en préparer une nouvelle version.`,
        )
      )
        return;
      await api(`/api/admin/contracts/${row.id}/cancel`, { method: "POST" });
      toast.success("Contrat annulé.");
      // La fiche a changé côté serveur (contrat à signer, dates, contrat signé) :
      // sans rechargement, le prochain « Enregistrer » remettrait les anciennes valeurs.
      window.location.reload();
    });

  // Une nouvelle version, seulement une fois le contrat signé des DEUX côtés
  // (ou abandonné) : tant que TIM n'a pas contresigné, il reste en cours.
  const closed = current && ["signe", "remplace", "annule"].includes(current.status);
  const status = shownInForce ? STATUS[shownInForce.status] : current ? STATUS[current.status] : null;

  return (
    <div className="sig-box ctr-box">
      <div className="sig-box__head">
        <span className="sig-box__title">Contrat</span>
        {status ? <span className={`ctr-pill ctr-pill--${status.tone}`}>{status.label}</span> : null}
      </div>

      {loadError ? (
        <p className="ctr-note">
          Les contrats n'ont pas pu être chargés. Rechargez la page ; si cela persiste, prévenez l'équipe technique.
        </p>
      ) : !current ? (
        <div className="ctr-empty">
          <p>
            Trois étapes : vérifier les informations du contrat, personnaliser le texte si besoin, relire et envoyer
            au client pour signature en ligne.
          </p>
          {canEdit ? (
            <button type="button" className="ctr-btn ctr-btn--primary" onClick={prepare} disabled={busy !== null}>
              {busy === "prepare" ? "Ouverture…" : "Préparer le contrat"}
            </button>
          ) : (
            <p className="ctr-muted">TIM prépare le contrat.</p>
          )}
        </div>
      ) : (
        <div className="ctr-current">
          <div className="ctr-current__line">
            <div>
              <p className="ctr-current__ref">
                {shownInForce ? `Contrat en vigueur : ${shownInForce.reference}` : current.reference}
                {!shownInForce && current.customSections ? (
                  <em className="ctr-tag ctr-tag--amber">
                    {current.customSections === 1
                      ? "1 section personnalisée"
                      : `${current.customSections} sections personnalisées`}
                  </em>
                ) : null}
              </p>
              <p className="ctr-muted">
                {current.status === "brouillon" &&
                  (missingCount
                    ? `${missingCount === 1 ? "1 information" : `${missingCount} informations`} à compléter avant l'envoi.`
                    : "Prêt à relire et à envoyer.")}
                {current.status === "envoye" && `Envoyé le ${frDate(current.sentAt)} — en attente de la signature du client.`}
                {current.status === "signe-client" &&
                  `Signé par le client le ${frDate(current.clientSignedAt)} — en attente de la signature de TIM.`}
                {current.status === "signe" && `Signé le ${frDate(current.clientSignedAt)} — contrat en vigueur.`}
                {(current.status === "remplace" || current.status === "annule") &&
                  (shownInForce ? (
                    `${shownInForce.clientSignedAt ? `Signé le ${frDate(shownInForce.clientSignedAt)}. ` : ""}La version ${current.reference} a été ${current.status === "annule" ? "annulée" : "remplacée"} (voir l'historique).`
                  ) : (
                    "Aucun contrat en cours."
                  ))}
              </p>
            </div>
            <div className="ctr-actions__main">
              {shownInForce ? (
                shownInForce.signedUrl || shownInForce.pdfUrl ? (
                  <button
                    type="button"
                    className="ctr-btn ctr-btn--ghost"
                    onClick={() => openPreview(shownInForce)}
                    disabled={busy !== null}
                  >
                    {busy === "preview" ? "Ouverture…" : "Voir le contrat signé"}
                  </button>
                ) : null
              ) : canEdit || current.signedUrl || current.pdfUrl ? (
                <button
                  type="button"
                  className="ctr-btn ctr-btn--ghost"
                  onClick={() => openPreview(current)}
                  disabled={busy !== null}
                >
                  {busy === "preview"
                    ? "Ouverture…"
                    : current.status === "signe-client"
                      ? "Voir la signature du client"
                      : current.signedUrl
                        ? "Voir le contrat signé"
                        : "Aperçu PDF"}
                </button>
              ) : null}
              {current.status === "brouillon" && canEdit ? (
                <button type="button" className="ctr-btn ctr-btn--primary" onClick={prepare} disabled={busy !== null}>
                  Continuer la préparation
                </button>
              ) : null}
              {current.status === "envoye" && canEdit ? (
                <button type="button" className="ctr-btn ctr-btn--ghost" onClick={() => reopen(current)} disabled={busy !== null}>
                  Reprendre en préparation
                </button>
              ) : null}
              {closed && canEdit ? (
                <button type="button" className="ctr-btn ctr-btn--ghost" onClick={prepare} disabled={busy !== null}>
                  {busy === "prepare" ? "Ouverture…" : "Nouvelle version"}
                </button>
              ) : null}
            </div>
          </div>

          {current.status === "brouillon" && canEdit ? (
            <>
              {modified ? (
                <p className="ctr-note">Enregistrez la fiche : le contrat se prépare à partir des informations enregistrées.</p>
              ) : null}
              <button type="button" className="ctr-link ctr-discard" onClick={() => discard(current)} disabled={busy !== null}>
                Abandonner ce brouillon
              </button>
            </>
          ) : null}
          {current.status === "signe-client" ? (
            <div className="ctr-countersign">
              <div>
                <p className="ctr-countersign__title">À contresigner par TIM</p>
                <p>
                  Le client a signé. Il recevra son exemplaire signé par les deux parties dès la contresignature.
                </p>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="ctr-btn ctr-btn--primary"
                  onClick={() => setCountersigning(current.id)}
                  disabled={busy !== null}
                >
                  Contresigner
                </button>
              ) : null}
            </div>
          ) : null}
          {/* Geste rare et destructif : en lien discret, sous le reste, confirmé. */}
          {(current.status === "envoye" || current.status === "signe-client") && canEdit ? (
            <button
              type="button"
              className="ctr-link ctr-link--danger ctr-discard"
              onClick={() => cancel(current)}
              disabled={busy !== null}
            >
              {busy === "cancel" ? "Annulation…" : "Annuler ce contrat"}
            </button>
          ) : null}
        </div>
      )}

      {history.length ? (
        <div className="ctr-history">
          <button type="button" className="ctr-link" onClick={() => setHistoryOpen((o) => !o)}>
            {historyOpen ? "Masquer l'historique" : `Historique (${history.length})`}
          </button>
          {historyOpen ? (
            <ul>
              {history.map((c) => (
                <li key={c.id}>
                  <span className="ctr-history__ref">{c.reference}</span>
                  <span className={`ctr-pill ctr-pill--${STATUS[c.status]?.tone ?? "gray"}`}>
                    {STATUS[c.status]?.label ?? c.status}
                    {c.id === inForce?.id ? " · en vigueur" : ""}
                  </span>
                  <span className="ctr-muted">{frDate(c.clientSignedAt ?? c.sentAt)}</span>
                  {c.signedUrl || c.pdfUrl ? (
                    <button type="button" className="ctr-link" onClick={() => openPreview(c)} disabled={busy !== null}>
                      Voir
                    </button>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {preview ? (
        <PreviewDrawer
          url={preview.url}
          title={preview.title}
          onClose={() => {
            if (preview.url.startsWith("blob:")) URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
        />
      ) : null}
      {countersigning !== null ? (
        <CountersignDrawer
          contractId={countersigning}
          onClose={() => setCountersigning(null)}
          onDone={() => {
            setCountersigning(null);
            window.location.reload();
          }}
        />
      ) : null}
      {editing !== null ? (
        <ContractWizard
          contractId={editing}
          onClose={() => {
            setEditing(null);
            void load();
          }}
          onChanged={() => void load()}
        />
      ) : null}
    </div>
  );
}
