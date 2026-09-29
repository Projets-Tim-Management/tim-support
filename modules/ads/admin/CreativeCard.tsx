"use client";

/* eslint-disable @next/next/no-img-element -- aperçus de fichiers du CDN Blob, à leur taille réelle : next/image n'apporte rien ici. */
import { toast } from "@payloadcms/ui";
import { useState } from "react";

import { TEXT_LIMITS } from "@/modules/ads/lib/copy/guardrails";

export type CardCreative = {
  id: number | string;
  angle: string;
  hook: string | null;
  tone: string;
  toneLabel: string;
  testLabels: string[];
  cta: string;
  status: string;
  campaign: { id: number | string; name: string } | null;
  texts: { kind: string; text: string; status: string; reason: string | null; chars: number }[];
  assets: { format: string; url: string | null; template: string | null }[];
  facts: { statement: string; source: string }[];
  costEur: number | null;
  decidedAt: string | null;
  refusal: string | null;
};

const REASONS = [
  { value: "hors-marque", label: "Hors marque (ton, style)" },
  { value: "faux", label: "Faux ou invérifiable" },
  { value: "mal-ecrit", label: "Mal écrit" },
  { value: "visuel", label: "Visuel à reprendre" },
  { value: "doublon", label: "Doublon" },
  { value: "autre", label: "Autre" },
];
const TEMPLATES = [
  { value: "capture", label: "Capture de l'app" },
  { value: "chiffre", label: "Un fait chiffré" },
  { value: "photo", label: "Photo de chantier" },
  { value: "texte", label: "Accroche seule" },
];
const KIND: Record<string, string> = { principal: "Textes principaux", titre: "Titres", description: "Descriptions" };
const FORMAT_LABEL: Record<string, string> = { "1x1": "1:1", "4x5": "4:5", "9x16": "9:16" };

/** Vert sous la cible (lu en entier), ambre entre la cible et la limite (tronqué par « Voir plus »). */
const charTone = (kind: string, n: number) => {
  const lim = TEXT_LIMITS[kind as keyof typeof TEXT_LIMITS];
  return !lim ? "" : n <= lim.target ? "ok" : "warn";
};

/**
 * Une créa dans la file : ce qu'il faut voir pour décider, et les gestes.
 *
 * Valider et refuser sont des clics qui agissent — pas de case à cocher puis
 * enregistrer. Refuser demande un motif, dans la carte (pas une fenêtre qui
 * cache ce qu'on refuse). Les textes rejetés par les garde-fous sont repliés
 * mais présents : on voit ce que le modèle a tenté.
 */
export function CreativeCard({ c }: { c: CardCreative }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [template, setTemplate] = useState("");
  const [safe, setSafe] = useState(true);

  const call = async (what: string, url: string, body: unknown, done: string) => {
    setBusy(what);
    try {
      const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      toast.success(done);
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message || "Action impossible.");
      setBusy(null);
    }
  };

  const ok = c.texts.filter((t) => t.status === "ok");
  const rejected = c.texts.filter((t) => t.status === "rejete");
  const pending = c.status === "a-valider";

  return (
    <article className="ads-card">
      <header className="ads-card__head">
        <div>
          <h3 className="ads-card__angle">{c.angle}</h3>
          <p className="ads-card__meta">
            {c.campaign?.name ?? "—"} · Bouton « {c.cta} »{c.costEur != null ? ` · ${c.costEur.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 3 })}` : ""}
          </p>
        </div>
        <div className="ads-card__badges">
          <span className="ads-badge">{c.toneLabel}</span>
          {c.testLabels.map((l) => (
            <span key={l} className="ads-badge ads-badge--test" title="Variante étiquetée : ses résultats seront comptés à part.">
              {l}
            </span>
          ))}
          {c.status === "validee" && <span className="ads-badge ads-badge--ok">Validée</span>}
          {c.status === "refusee" && <span className="ads-badge ads-badge--bad">Refusée{c.refusal ? ` — ${c.refusal}` : ""}</span>}
        </div>
      </header>

      <div className="ads-card__body">
        <div className="ads-card__visuals">
          {c.assets.length ? (
            c.assets.map((a) => (
              <figure key={a.format} className={`ads-shot ads-shot--${a.format}`}>
                {a.url ? <img src={a.url} alt={`${c.angle} — ${FORMAT_LABEL[a.format]}`} /> : null}
                {a.format === "9x16" && safe && <span className="ads-shot__safe" aria-hidden />}
                <figcaption>{FORMAT_LABEL[a.format] ?? a.format}</figcaption>
              </figure>
            ))
          ) : (
            <p className="ads-card__empty">Pas encore de visuel.</p>
          )}
          {c.assets.some((a) => a.format === "9x16") && (
            <label className="ads-card__toggle">
              <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} /> Zone sûre 9:16 (ce que l&apos;interface de Meta peut couvrir)
            </label>
          )}
        </div>

        <div className="ads-card__texts">
          {c.hook && (
            <p className="ads-card__hook">
              <span>Accroche du visuel</span> {c.hook}
            </p>
          )}
          {(["principal", "titre", "description"] as const).map((kind) => {
            const list = ok.filter((t) => t.kind === kind);
            if (!list.length) return null;
            return (
              <section key={kind} className="ads-card__group">
                <h4>
                  {KIND[kind]} <small>limite {TEXT_LIMITS[kind].max}, lu en entier jusqu&apos;à {TEXT_LIMITS[kind].target}</small>
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
          {c.facts.length > 0 && (
            <p className="ads-card__facts">
              Cite : {c.facts.map((f) => `${f.statement} (${f.source})`).join(" ; ")}
            </p>
          )}
          {rejected.length > 0 && (
            <details className="ads-card__rejected">
              <summary>{rejected.length} texte(s) rejeté(s) par les garde-fous</summary>
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
      </div>

      <footer className="ads-card__actions">
        {pending && !refusing && (
          <>
            <button type="button" className="tim-btn tim-btn--primary" disabled={busy != null} onClick={() => call("ok", `/api/admin/ads/creatives/${c.id}/decide`, { decision: "validee" }, "Créa validée.")}>
              {busy === "ok" ? "…" : "Valider"}
            </button>
            <button type="button" className="tim-btn" disabled={busy != null} onClick={() => setRefusing(true)}>
              Refuser…
            </button>
          </>
        )}
        {pending && refusing && (
          <div className="ads-card__refuse">
            <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motif du refus">
              <option value="">Motif du refus…</option>
              {REASONS.map((r) => (
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
              onClick={() => call("ko", `/api/admin/ads/creatives/${c.id}/decide`, { decision: "refusee", reason, detail }, "Créa refusée.")}
            >
              {busy === "ko" ? "…" : "Refuser"}
            </button>
            <button type="button" className="tim-btn" disabled={busy != null} onClick={() => setRefusing(false)}>
              Annuler
            </button>
          </div>
        )}
        {(pending || c.status === "brouillon") && (
          <div className="ads-card__rerender">
            <select value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Gabarit">
              <option value="">Changer de visuel…</option>
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="button" className="tim-btn" disabled={!template || busy != null} onClick={() => call("render", `/api/admin/ads/creatives/${c.id}/render`, { template }, "Visuels rendus de nouveau.")}>
              {busy === "render" ? "Rendu…" : "Rendre"}
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
