"use client";

import { toast } from "@payloadcms/ui";
import { useState } from "react";

import { TEXT_LIMITS } from "@/modules/ads/lib/copy/guardrails";
import { REFUSAL_REASONS } from "@/modules/ads/lib/creative-options";

import { StepCreate, StepImport, type Attachment, type CardBrief, type CardFile, type ExpectedFile } from "./CreativeDesign";
import { postAdmin } from "./post-admin";

export type { Attachment };

export type CardCreative = {
  id: number | string;
  angle: string;
  /** L'angle tel que l'agent de campagne l'a demandé, s'il vient d'un passage d'agent. */
  requestedAngle: string | null;
  hook: string | null;
  tone: string;
  toneLabel: string;
  testLabels: string[];
  cta: string;
  status: string;
  campaign: { id: number | string; name: string } | null;
  texts: { kind: string; text: string; status: string; reason: string | null; chars: number }[];
  /** Le brief Claude Design, s'il est écrit. */
  brief: CardBrief | null;
  /** Les fichiers finis importés, ceux que le brief attend, et ce qu'il manque. */
  files: CardFile[];
  expected: ExpectedFile[];
  missing: string[];
  facts: { statement: string; source: string }[];
  costEur: number | null;
  decidedAt: string | null;
  refusal: string | null;
};

/** Où en est une créa, en un mot : c'est ce qui dit quoi faire maintenant. Pure. */
export type CardStage = "creer" | "importer" | "valider" | "validee" | "refusee" | "sans-brief";
export function stageOf(c: Pick<CardCreative, "status" | "brief" | "files" | "missing">): CardStage {
  if (c.status === "validee" || c.status === "en-ligne") return "validee";
  if (c.status === "refusee") return "refusee";
  if (!c.brief) return "sans-brief";
  if (!c.files.length) return "creer";
  return c.missing.length ? "importer" : "valider";
}

const STAGE_LABEL: Record<CardStage, string> = {
  creer: "À créer dans Claude Design",
  importer: "Fichiers à compléter",
  valider: "Prête à valider",
  validee: "Validée",
  refusee: "Refusée",
  "sans-brief": "Sans brief",
};

const KIND: Record<string, string> = { principal: "Textes principaux", titre: "Titres", description: "Descriptions" };

/** Vert sous la cible (lu en entier), ambre entre la cible et la limite (tronqué par « Voir plus »). */
const charTone = (kind: string, n: number) => {
  const lim = TEXT_LIMITS[kind as keyof typeof TEXT_LIMITS];
  return !lim ? "" : n <= lim.target ? "ok" : "warn";
};

/**
 * Une créa dans la file, en TROIS ÉTAPES numérotées — créer dans Claude Design,
 * importer les fichiers, valider — dont seule l'étape en cours est mise en
 * avant. Le badge dit en un mot ce qu'il reste à faire. Les textes de l'annonce
 * (une douzaine) sont repliés derrière un aperçu : on les relit au moment de
 * valider, pas avant d'avoir créé la pub.
 *
 * Valider et refuser sont des clics qui agissent. Refuser demande un motif,
 * dans la carte.
 */
export function CreativeCard({ c, logos = [] }: { c: CardCreative; logos?: Attachment[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");

  const call = async (what: string, url: string, body: unknown, done: string) => {
    setBusy(what);
    try {
      await postAdmin(url, body);
      toast.success(done);
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message || "Action impossible.");
      setBusy(null);
    }
  };

  const stage = stageOf(c);
  const ok = c.texts.filter((t) => t.status === "ok");
  const rejected = c.texts.filter((t) => t.status === "rejete");
  const open = c.status === "a-valider" || c.status === "brouillon";
  const firstText = ok.find((t) => t.kind === "principal")?.text;
  const firstTitle = ok.find((t) => t.kind === "titre")?.text;
  const step = stage === "creer" ? 1 : stage === "importer" ? 2 : 3;

  return (
    <article className={`ads-card ads-card--${stage}`}>
      <header className="ads-card__head">
        <div>
          <h3 className="ads-card__angle">{c.angle}</h3>
          <p className="ads-card__meta">
            C{String(c.id)} · {c.campaign?.name ?? "—"} · Bouton « {c.cta} » · {c.toneLabel}
            {c.testLabels.length ? ` · ${c.testLabels.join(", ")}` : ""}
          </p>
        </div>
        <span className={`ads-stage ads-stage--${stage}`}>{STAGE_LABEL[stage]}{stage === "refusee" && c.refusal ? ` — ${c.refusal}` : ""}</span>
      </header>

      {c.brief && open && (
        <ol className="ads-steps">
          <li className={`ads-step${step === 1 ? " ads-step--current" : " ads-step--done"}`}>
            <div className="ads-step__head">
              <span className="ads-step__num">{step > 1 ? "✓" : "1"}</span>
              <strong>Créer la pub dans Claude Design</strong>
            </div>
            {step === 1 ? (
              <StepCreate brief={c.brief} logos={logos} />
            ) : (
              <details className="ads-step__again">
                <summary>Revoir le brief</summary>
                <StepCreate brief={c.brief} logos={logos} />
              </details>
            )}
          </li>
          <li className={`ads-step${step === 2 ? " ads-step--current" : step > 2 ? " ads-step--done" : ""}`}>
            <div className="ads-step__head">
              <span className="ads-step__num">{step > 2 ? "✓" : "2"}</span>
              <strong>Importer les fichiers exportés</strong>
            </div>
            <StepImport id={c.id} files={c.files} expected={c.expected} editable={open} />
          </li>
          <li className={`ads-step${step === 3 ? " ads-step--current" : ""}`}>
            <div className="ads-step__head">
              <span className="ads-step__num">3</span>
              <strong>Relire les textes et valider</strong>
            </div>
          </li>
        </ol>
      )}

      {stage === "validee" && c.files.length > 0 && <StepImport id={c.id} files={c.files} expected={c.expected} editable={false} />}

      <details className="ads-card__copy">
        <summary>
          <span>Textes de l&apos;annonce</span>
          {firstTitle || firstText ? (
            <em>
              {firstTitle ? `« ${firstTitle} »` : ""}
              {firstTitle && firstText ? " — " : ""}
              {firstText ? `${firstText.slice(0, 90)}${firstText.length > 90 ? "…" : ""}` : ""}
            </em>
          ) : null}
          <small>
            {ok.filter((t) => t.kind === "principal").length} textes, {ok.filter((t) => t.kind === "titre").length} titres, {ok.filter((t) => t.kind === "description").length} descriptions
          </small>
        </summary>
        <div className="ads-card__texts">
          {c.hook && (
            <p className="ads-card__hook">
              <span>Accroche</span> {c.hook}
            </p>
          )}
          {(["principal", "titre", "description"] as const).map((kind) => {
            const list = ok.filter((t) => t.kind === kind);
            if (!list.length) return null;
            return (
              <section key={kind} className="ads-card__group">
                <h4>
                  {KIND[kind]} <small>lu en entier jusqu&apos;à {TEXT_LIMITS[kind].target} caractères</small>
                </h4>
                <ol>
                  {list.map((t, i) => (
                    <li key={i}>
                      <span className="ads-card__text">{t.text}</span>
                      <span className={`ads-count ads-count--${charTone(kind, t.chars)}`}>{t.chars}</span>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
          {c.facts.length > 0 && <p className="ads-card__facts">Preuves citées : {c.facts.map((f) => `${f.statement} (${f.source})`).join(" ; ")}</p>}
          {rejected.length > 0 && (
            <details className="ads-card__rejected">
              <summary>{rejected.length} texte(s) écarté(s) par les garde-fous</summary>
              <ul>
                {rejected.map((t, i) => (
                  <li key={i}>
                    <s>{t.text}</s> — <em>{t.reason}</em>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </details>

      <footer className="ads-card__actions">
        {c.status === "a-valider" && !refusing && (
          <>
            <button
              type="button"
              className="tim-btn tim-btn--primary"
              disabled={busy != null || stage !== "valider"}
              title={stage === "valider" ? undefined : c.brief ? `Importez d'abord : ${c.missing.join(", ")}` : "Cette créa n'a pas de brief : refusez-la."}
              onClick={() => call("ok", `/api/admin/ads/creatives/${c.id}/decide`, { decision: "validee" }, "Créa validée.")}
            >
              {busy === "ok" ? "…" : "Valider"}
            </button>
            <button type="button" className="tim-btn" disabled={busy != null} onClick={() => setRefusing(true)}>
              Refuser…
            </button>
            {stage !== "valider" && c.brief && <span className="ads-card__hint">Valider s&apos;active quand tous les fichiers sont importés.</span>}
          </>
        )}
        {c.status === "a-valider" && refusing && (
          <div className="ads-card__refuse">
            <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motif du refus">
              <option value="">Motif du refus…</option>
              {REFUSAL_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Précision (facultatif)" aria-label="Précision" />
            <button
              type="button"
              className="tim-btn ads-actions__danger"
              disabled={!reason || busy != null}
              onClick={() => call("ko", `/api/admin/ads/creatives/${c.id}/decide`, { decision: "refusee", reason, detail }, reason === "doublon" ? "Créa refusée." : "Créa refusée. Une consigne pour l'agent vous attend en haut de la page.")}
            >
              {busy === "ko" ? "…" : "Refuser"}
            </button>
            <button type="button" className="tim-btn" disabled={busy != null} onClick={() => setRefusing(false)}>
              Annuler
            </button>
          </div>
        )}
        {c.status === "validee" && (
          <a className="tim-btn tim-btn--primary" href={`/api/admin/ads/creatives/${c.id}/download`}>
            Télécharger (ZIP)
          </a>
        )}
      </footer>
    </article>
  );
}
