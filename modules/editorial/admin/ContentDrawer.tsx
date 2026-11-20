"use client";

import { useConfig } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { htmlToText } from "@/core/lib/html";
import { Drawer } from "@/modules/ai-team/admin/Drawer";
import { clearHighlights, highlightIn, quotedPassages } from "@/modules/editorial/admin/highlightIssues";
import { HtmlEditor } from "@/modules/editorial/admin/HtmlEditor";
import { ImagePanel } from "@/modules/editorial/admin/ImagePanel";
import { autoFixArticle, fixBrand } from "@/modules/editorial/lib/articles/autofix";
import { reviewerName, WP_REVIEWER_LIST } from "@/modules/editorial/lib/articles/from-wp";
import { articleStatusMeta } from "@/modules/editorial/lib/articles/statuses";
import { articleCoverageInput, jobCoverageInput } from "@/modules/editorial/lib/competitors/content";
import { coverage, type Corpus, type Coverage } from "@/modules/editorial/lib/competitors/terms";
import type { Criterion } from "@/modules/editorial/lib/score/criteria";
import { scoreContent } from "@/modules/editorial/lib/score/measure";
import { articleScoreInput, jobScoreInput } from "@/modules/editorial/lib/score/run";

/**
 * LE TIROIR D'UN ARTICLE OU D'UNE FICHE MÉTIER — éditeur d'optimisation façon Semji
 * (refonte de l'UX le 19/11/2026 ; logique des étapes 2 à 5 du module de note inchangée).
 *
 * - En haut, une barre fixe : titre, statut, « Voir sur le site », nombre de changements,
 *   « Enregistrer dans WordPress ».
 * - À gauche, le DOCUMENT sur fond gris, comme une page : mot-clé visé, titre (H1), aperçu
 *   Google modifiable sur place (jauges de longueur), puis l'article d'un seul tenant
 *   (introduction, blocs, conclusion, FAQ, sources) ; la barre de mise en forme n'apparaît
 *   que dans la section en cours. Fiche métier : définition, synonymes, points clés, FAQ ;
 *   chiffres France Travail et certifications en lecture seule.
 * - À droite, l'OPTIMISATION : grande jauge de couverture face au top 10 (cible marquée),
 *   petites jauges SEO et GEO, alertes ; menu : Mots-clés (barres de progression, filtres),
 *   Questions, Entités, Concurrents, Liens, Critères. Tout se recalcule pendant la frappe.
 *
 * « Enregistrer dans WordPress » écrit SEULEMENT les champs modifiés (relire avant, écrire,
 * relire après) ; marque mal écrite, promesse ou texte trop proche d'un concurrent bloquent.
 */

type Raw = Record<string, unknown>;
type Etat = "rempli" | "partiel" | "manquant" | "a-venir" | "attente" | "sans-objet";
type Crit = { id: string; jauge: "seo" | "geo"; libelle: string; poids: number; preuve: string; statut: string; resultat: number | null; points: number | null; detail: string; mesure: string; source: string | null; etat?: Etat; action?: string | null; seuils?: Record<string, number> | null; applique?: ("article" | "fiche")[] };
type Detail = { seo: number | null; geo: number | null; alertes: string[]; criteres: Crit[]; provisoire?: { seo: boolean; geo: boolean }; comptes?: { seo: [number, number]; geo: [number, number] } };
type CompPage = { rank: number; url: string; domain: string; title: string; words: number; h2s: string[]; excluded: string | null; score: number | null };
type Copy = { ratio: number; domain: string | null; url: string | null; blocked: string | null; warning: string | null };
type LinkSug = { url: string; label: string; kind: "article" | "fiche" | "page"; score: number; anchor: string | null };
type Comp = { keyword: string; configured: boolean; snapshot: { takenAt: string; questions: string[]; pages: CompPage[]; corpus: Corpus & { target?: number | null }; costUsd?: number } | null; copy?: Copy | null; links?: LinkSug[] };

const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ── Petits éléments visuels ──────────────────────────────────────────────────

/** Une jauge circulaire (SVG) : valeur en %, cible marquée par un trait. */
function Ring({ value, target, size, stroke, label, sub }: { value: number | null; target?: number | null; size: number; stroke: number; label?: string; sub?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone = value == null ? "none" : target != null ? (value >= target ? "good" : value >= target - 15 ? "mid" : "low") : value >= 75 ? "good" : value >= 50 ? "mid" : "low";
  const angle = target != null ? (target / 100) * 360 - 90 : null;
  return (
    <div className={`cdx-ring cdx-ring--${tone}`} style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="cdx-ring__track" strokeWidth={stroke} fill="none" />
        {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} className="cdx-ring__value" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
        {angle != null && value != null && (
          <line
            x1={size / 2 + (r - stroke) * Math.cos((angle * Math.PI) / 180)}
            y1={size / 2 + (r - stroke) * Math.sin((angle * Math.PI) / 180)}
            x2={size / 2 + (r + stroke) * Math.cos((angle * Math.PI) / 180)}
            y2={size / 2 + (r + stroke) * Math.sin((angle * Math.PI) / 180)}
            className="cdx-ring__target"
            strokeWidth={3}
          />
        )}
      </svg>
      <div className="cdx-ring__center">
        <strong>{value == null ? "—" : value}</strong>
        {value != null && <span>%</span>}
      </div>
      {label && <div className="cdx-ring__label">{label}</div>}
      {sub && <div className="cdx-ring__sub">{sub}</div>}
    </div>
  );
}

/** Un compteur de longueur sous un champ : barre colorée (trop court, bon, trop long). */
function LengthBar({ n, min, max, unit = "car." }: { n: number; min: number; max: number; unit?: string }) {
  const state = n === 0 ? "empty" : n < min ? "short" : n > max ? "long" : "ok";
  return (
    <div className={`cdx-len cdx-len--${state}`}>
      <span className="cdx-len__bar">
        <span style={{ width: `${Math.min(100, (n / max) * 100)}%` }} />
      </span>
      <span className="cdx-len__txt">
        {n} {unit} · idéal {min}–{max}
      </span>
    </div>
  );
}

function DocSection({ label, changed, children }: { label: string; changed?: boolean; children: React.ReactNode }) {
  return (
    <section className={`cdx-sec${changed ? " is-changed" : ""}`}>
      <div className="cdx-sec__label">
        {label}
        {changed && <span className="cdx-dot" title="Modifié" />}
      </div>
      <div className="cdx-sec__body">{children}</div>
    </section>
  );
}

const PROOF: Record<string, string> = { A: "officiel ou expérimental", B: "corrélation large", C: "règle maison", D: "contredit par une corrélation" };
const RISK = { aucun: "aucune", modere: "modérée", eleve: "élevée" } as const;
const KIND = { article: "Article", fiche: "Fiche métier", page: "Page du site" } as const;
const STATE_LABEL = { absent: "À ajouter", insuffisant: "Trop peu", ok: "OK", exces: "Trop" } as const;

// ── Panneau d'optimisation ───────────────────────────────────────────────────

type PanelTab = "mots" | "questions" | "entites" | "concurrents" | "liens" | "criteres";
const TABS: { id: PanelTab; label: string }[] = [
  { id: "mots", label: "Mots-clés" },
  { id: "questions", label: "Questions" },
  { id: "entites", label: "Entités" },
  { id: "concurrents", label: "Concurrents" },
  { id: "liens", label: "Liens" },
  { id: "criteres", label: "Critères" },
];

function Terms({ cov }: { cov: Coverage }) {
  const [filter, setFilter] = useState<"tous" | "a-ajouter" | "ok" | "exces">("tous");
  const counts = {
    tous: cov.terms.length,
    "a-ajouter": cov.terms.filter((t) => t.state === "absent" || t.state === "insuffisant").length,
    ok: cov.terms.filter((t) => t.state === "ok").length,
    exces: cov.terms.filter((t) => t.state === "exces").length,
  };
  const shown = cov.terms.filter((t) => filter === "tous" || (filter === "a-ajouter" ? t.state === "absent" || t.state === "insuffisant" : filter === "ok" ? t.state === "ok" : t.state === "exces"));
  return (
    <>
      <div className="cdx-filters" role="group" aria-label="Filtrer les mots-clés">
        {(["tous", "a-ajouter", "ok", "exces"] as const).map((f) => (
          <button key={f} type="button" className={`cdx-filter${filter === f ? " is-active" : ""}`} onClick={() => setFilter(f)}>
            {f === "tous" ? "Tous" : f === "a-ajouter" ? "À ajouter" : f === "ok" ? "OK" : "En excès"} <span>{counts[f]}</span>
          </button>
        ))}
      </div>
      <ul className="cdx-terms">
        {shown.map((t) => (
          <li key={t.key} className={`cdx-term cdx-term--${t.state}`} title={`Employé par ${Math.round(t.share * 100)} % des pages classées`}>
            <div className="cdx-term__head">
              <span className="cdx-term__label">{t.label}</span>
              <span className="cdx-term__count">
                {t.count}
                <small> / {t.minCount === t.maxCount ? t.minCount : `${t.minCount}–${t.maxCount}`}</small>
              </span>
            </div>
            <div className="cdx-term__bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (t.count / Math.max(1, t.maxCount)) * 100)}%` }} />
            </div>
            <span className="cdx-term__state">{STATE_LABEL[t.state]}</span>
          </li>
        ))}
      </ul>
      <p className="cdx-hint">Fourchette des pages classées, ramenée à ton texte ({cov.words} mots). Ajoute une notion là où elle sert le lecteur ; n'en force aucune.</p>
    </>
  );
}

function OptimisationPanel({ detail, version, live, comp, cov, onAnalyze, analyzing }: { detail: Detail; version: unknown; live: boolean; comp: Comp | null; cov: Coverage | null; onAnalyze: () => void; analyzing: boolean }) {
  const [tab, setTab] = useState<PanelTab>("mots");
  const [gauge, setGauge] = useState<"seo" | "geo">("seo");
  const snap = comp?.snapshot ?? null;
  const target = snap?.corpus.target ?? null;
  const score = cov?.score ?? null;
  const crit = Array.isArray(detail.criteres) ? detail.criteres : [];
  // Règles v3 : l'état écrit par le moteur (rempli, partiel, manquant, à venir, en attente, sans objet).
  const state = (c: Crit): keyof typeof ICON => (c.statut === "info" ? "info" : c.etat === "rempli" ? "ok" : c.etat === "partiel" ? "part" : c.etat === "a-venir" ? "later" : c.etat === "attente" ? "wait" : c.etat === "sans-objet" ? "na" : c.etat === "manquant" ? "ko" : c.resultat == null ? "na" : c.resultat >= 1 ? "ok" : c.resultat > 0 ? "part" : "ko");
  const ICON = { info: "i", na: "–", ok: "✓", part: "◐", ko: "✕", later: "⏳", wait: "…" } as const;
  const STATE_TXT = { info: "Pour information", na: "Sans objet", ok: "Rempli", part: "Partiel", ko: "Manquant", later: "À venir", wait: "En attente" } as const;
  const counts = detail.comptes;
  const prov = detail.provisoire;
  const analyzeBtn = (
    <button type="button" className="cdx-btn cdx-btn--ghost" disabled={analyzing || !comp?.configured || !comp?.keyword} onClick={onAnalyze} title="Relève le top 20 de Google sur la requête (≈ 0,004 €).">
      {analyzing ? "Analyse en cours…" : snap ? "Réanalyser" : "Analyser les concurrents"}
    </button>
  );
  const headline =
    !comp ? "Chargement…" : !snap ? (comp.keyword ? `Pas encore d'analyse sur « ${comp.keyword} »` : "Renseigne le mot-clé visé") : snap.corpus.insufficient ? "Pas assez de vrais articles dans le top 10 pour comparer" : score == null ? "—" : target == null ? "Couverture du sujet" : score >= target ? "Cible atteinte" : `Encore ${target - score} points pour la cible`;

  return (
    <aside className="cdx-panel" aria-label="Optimisation">
      <div className="cdx-hero">
        <Ring value={snap && !snap.corpus.insufficient ? score : null} target={target} size={148} stroke={12} />
        <div className="cdx-hero__txt">
          <span className="cdx-eyebrow">Score de contenu</span>
          <strong>{headline}</strong>
          <span className="cdx-muted">{snap ? `« ${comp?.keyword} » · top 10 du ${new Date(snap.takenAt).toLocaleDateString("fr-FR")}${target != null ? ` · cible ${target} %` : ""}` : comp && !comp.configured ? "DataForSEO n'est pas branché." : ""}</span>
          {analyzeBtn}
        </div>
      </div>
      <div className="cdx-minis">
        <button type="button" className={`cdx-mini${tab === "criteres" && gauge === "seo" ? " is-active" : ""}`} onClick={() => (setTab("criteres"), setGauge("seo"))}>
          <Ring value={detail.seo ?? null} size={64} stroke={7} />
          <span>SEO{prov?.seo ? " · provisoire" : ""}</span>
        </button>
        <button type="button" className={`cdx-mini${tab === "criteres" && gauge === "geo" ? " is-active" : ""}`} onClick={() => (setTab("criteres"), setGauge("geo"))}>
          <Ring value={detail.geo ?? null} size={64} stroke={7} />
          <span>GEO{prov?.geo ? " · provisoire" : ""}</span>
        </button>
        <div className="cdx-flags">
          {cov && !cov.insufficient && <span className={`cdx-flag cdx-flag--${cov.riskLevel}`}>Sur-optimisation {RISK[cov.riskLevel]}</span>}
          {comp?.copy?.domain && (
            <span className={`cdx-flag cdx-flag--${comp.copy.blocked ? "eleve" : comp.copy.warning ? "modere" : "aucun"}`} title={comp.copy.blocked ?? comp.copy.warning ?? "Part du texte enregistré reprise de la page concurrente la plus proche. Dès 15 %, l'enregistrement est refusé."}>
              Ressemblance {Math.round(comp.copy.ratio * 100)} %
            </span>
          )}
          {live && <span className="cdx-flag cdx-flag--live">Recalculé en direct</span>}
        </div>
      </div>
      {detail.alertes?.length > 0 && (
        <div className="cdx-alerts" role="alert">
          {detail.alertes.slice(0, 4).map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
      )}

      <div className="cdx-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`cdx-tab${tab === t.id ? " is-active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="cdx-tabpanel">
        {tab === "criteres" ? (
          <>
            <div className="cdx-filters">
              {(["seo", "geo"] as const).map((g) => (
                <button key={g} type="button" className={`cdx-filter${gauge === g ? " is-active" : ""}`} onClick={() => setGauge(g)}>
                  {g.toUpperCase()} <span>{g === "seo" ? (detail.seo ?? "—") : (detail.geo ?? "—")} %</span>
                </button>
              ))}
            </div>
            {counts && (
              <p className="cdx-hint cdx-hint--top">
                {counts[gauge][0]} critère{counts[gauge][0] > 1 ? "s" : ""} compté{counts[gauge][0] > 1 ? "s" : ""} sur {counts[gauge][1]}
                {prov?.[gauge] ? " · note provisoire : des éléments arrivent à une étape suivante ou attendent un relevé" : ""}
              </p>
            )}
            <ul className="cdx-checks">
              {crit
                .filter((c) => c.jauge === gauge)
                .map((c) => (
                  <li key={c.id} className={`cdx-check cdx-check--${state(c)}`}>
                    <span className="cdx-check__icon" aria-hidden="true">
                      {ICON[state(c)]}
                    </span>
                    <div>
                      <strong>{c.libelle}</strong>
                      <span className={`cdx-state cdx-state--${state(c)}`}>{STATE_TXT[state(c)]}</span>
                      <p>{c.detail}</p>
                      {c.action && <p className="cdx-action">→ {c.action}</p>}
                      <small>
                        {c.statut === "info" ? "Pour information (poids 0)" : c.points == null ? `Hors calcul · /${c.poids}` : `${c.points}/${c.poids} points`} · preuve {c.preuve} ({PROOF[c.preuve] ?? "?"})
                        {c.source && (
                          <>
                            {" · "}
                            <a href={c.source} target="_blank" rel="noreferrer">
                              source
                            </a>
                          </>
                        )}
                      </small>
                    </div>
                  </li>
                ))}
            </ul>
            <p className="cdx-hint">Règles v{String(version ?? "?")} · note de conformité aux règles, pas une prévision de classement ni de citation.</p>
          </>
        ) : tab === "liens" ? (
          comp?.links?.length ? (
            <ul className="cdx-cards">
              {comp.links.map((l) => (
                <li key={l.url} className="cdx-card">
                  <div className="cdx-card__top">
                    <span className="cdx-tag">{KIND[l.kind]}</span>
                    <span className="cdx-card__pct">{Math.round(l.score * 100)} %</span>
                  </div>
                  <a href={l.url} target="_blank" rel="noreferrer" className="cdx-card__title">
                    {l.label}
                  </a>
                  <p>{l.anchor ? `Ancre possible : « ${l.anchor} »` : "Pas d'ancre évidente : à placer là où le sujet est évoqué."}</p>
                  <button type="button" className="cdx-btn cdx-btn--ghost cdx-btn--sm" onClick={() => void navigator.clipboard?.writeText(l.url)}>
                    Copier l'adresse
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cdx-empty">{comp ? "Aucune page proche à lier, ou déjà toutes liées." : "Chargement…"}</p>
          )
        ) : !snap || snap.corpus.insufficient ? (
          <p className="cdx-empty">{snap?.corpus.insufficient ?? "Lance l'analyse des concurrents pour voir les mots-clés, questions et entités du top 10."}</p>
        ) : tab === "mots" ? (
          cov ? <Terms cov={cov} /> : <p className="cdx-empty">Calcul…</p>
        ) : tab === "questions" ? (
          cov?.questions.length ? (
            <ul className="cdx-checks">
              {cov.questions.map((q) => (
                <li key={q.question} className={`cdx-check cdx-check--${q.covered ? "ok" : "ko"}`}>
                  <span className="cdx-check__icon" aria-hidden="true">
                    {q.covered ? "✓" : "?"}
                  </span>
                  <div>
                    <strong>{q.question}</strong>
                    <small>{q.covered ? "Traitée dans un titre ou la FAQ" : "Pas encore traitée"}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cdx-empty">Google n'affiche pas d'« Autres questions posées » sur cette requête.</p>
          )
        ) : tab === "entites" ? (
          cov?.entities.length ? (
            <div className="cdx-chips">
              {cov.entities.map((e) => (
                <span key={e.label} className={`cdx-chip${e.present ? " is-on" : ""}`} title={`Cité par ${Math.round(e.share * 100)} % des pages classées`}>
                  {e.present ? "✓ " : "+ "}
                  {e.label}
                </span>
              ))}
              <p className="cdx-hint">Organismes, textes et sigles cités par la majorité des pages classées. N'en nomme un que s'il sert le lecteur, avec une source.</p>
            </div>
          ) : (
            <p className="cdx-empty">Aucune entité commune aux pages classées.</p>
          )
        ) : (
          <>
            <div className="cdx-stats">
              <div>
                <strong>{cov?.words ?? "—"}</strong>
                <span>mots chez toi</span>
              </div>
              <div>
                <strong>{snap.corpus.medianWords ?? "—"}</strong>
                <span>médiane du top 10</span>
              </div>
              <div>
                <strong>{snap.corpus.medianH2 ?? "—"}</strong>
                <span>titres (médiane)</span>
              </div>
            </div>
            <ol className="cdx-serp">
              {snap.pages.map((p) => (
                <li key={p.url} className={p.excluded ? "is-out" : ""}>
                  <span className="cdx-serp__rank">{p.rank}</span>
                  <div className="cdx-serp__main">
                    <a href={p.url} target="_blank" rel="noreferrer">
                      {p.title || p.domain}
                    </a>
                    <small>{p.excluded ? `${p.domain} · écartée : ${p.excluded}` : `${p.domain} · ${p.words} mots · ${p.h2s.length} H2`}</small>
                  </div>
                  <span className="cdx-serp__score">{p.excluded ? "" : p.score == null ? "—" : `${p.score} %`}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </aside>
  );
}

/** Les critères d'une note enregistrée, dans la forme du moteur (pour recalculer pendant la frappe). */
const criteriaFromDetail = (d: Detail, kind: "article" | "fiche"): Criterion[] =>
  (d.criteres ?? []).map((c) => ({ id: c.id, gauge: c.jauge, label: c.libelle, measure: c.mesure, weight: c.poids, level: c.preuve as Criterion["level"], status: c.statut as Criterion["status"], source: c.source ?? undefined, applies: c.applique ?? [kind], ...(c.seuils ? { params: c.seuils } : {}) }));

const toDetail = (r: ReturnType<typeof scoreContent>): Detail => ({
  seo: r.seo,
  geo: r.geo,
  alertes: r.alerts,
  provisoire: r.provisional,
  comptes: r.counted,
  criteres: r.criteria.map((c) => ({ id: c.id, jauge: c.gauge, libelle: c.label, poids: c.weight, preuve: c.level, statut: c.status, resultat: c.value, points: c.points, detail: c.detail, mesure: c.measure, source: c.source ?? null, etat: c.state, action: c.action, seuils: c.params ?? null, applique: c.applies })),
});

// ── Le document : article ────────────────────────────────────────────────────

type ArticleState = { title: string; seoTitle: string; seoDescription: string; keyword: string; acf: Raw };

function articleState(doc: Raw): ArticleState {
  const inWp = Object.keys(obj(doc.acf)).length > 0;
  const a = inWp ? obj(doc.acf) : obj(doc.draft);
  return {
    title: String((inWp ? doc.title : (a.title ?? doc.title)) ?? ""),
    seoTitle: String((inWp ? doc.seoTitle : a.yoast_title) ?? ""),
    seoDescription: String((inWp ? doc.seoDescription : a.yoast_description) ?? ""),
    keyword: String(doc.keyword || doc.wpFocusKeyword || ""),
    acf: structuredClone(a),
  };
}

/** L'aperçu Google : ce que verra l'internaute ; « Modifier » ouvre les champs sur place. */
function SerpPreview({ s, set, link, changed }: { s: ArticleState; set: (f: (p: ArticleState) => ArticleState) => void; link: string | null; changed: boolean }) {
  const [editing, setEditing] = useState(false);
  const title = s.seoTitle || s.title;
  const url = (link ?? "https://tim-management.co/actualite/…").replace(/^https?:\/\//, "").replace(/\/$/, "").split("/");
  return (
    <div className={`cdx-serp-card${changed ? " is-changed" : ""}`}>
      <div className="cdx-serp-card__head">
        <span className="cdx-eyebrow">Aperçu Google</span>
        <button type="button" className="cdx-btn cdx-btn--ghost cdx-btn--sm" onClick={() => setEditing((v) => !v)}>
          {editing ? "Fermer" : "Modifier"}
        </button>
      </div>
      <div className="cdx-serp-card__url">{url.join(" › ")}</div>
      <div className="cdx-serp-card__title">{title.length > 62 ? `${title.slice(0, 60)}…` : title || "Titre SEO"}</div>
      <div className="cdx-serp-card__desc">{s.seoDescription ? (s.seoDescription.length > 158 ? `${s.seoDescription.slice(0, 155)}…` : s.seoDescription) : "Méta description à écrire."}</div>
      {editing && (
        <div className="cdx-serp-card__edit">
          <label className="cdx-field">
            <span>Titre SEO</span>
            <input value={s.seoTitle} onChange={(e) => set((p) => ({ ...p, seoTitle: e.target.value }))} />
            <LengthBar n={s.seoTitle.trim().length} min={30} max={60} />
          </label>
          <label className="cdx-field">
            <span>Méta description</span>
            <textarea rows={3} value={s.seoDescription} onChange={(e) => set((p) => ({ ...p, seoDescription: e.target.value }))} />
            <LengthBar n={s.seoDescription.trim().length} min={120} max={155} />
          </label>
        </div>
      )}
    </div>
  );
}

// ── En haut du tiroir : ce que la direction doit faire (19/11/2026) ─────────

const TODO_STATUSES = ["a-relire", "a-verifier", "image", "pret", "programme", "publie", "a-rafraichir"];
const longDate = (iso: unknown) => new Date(String(iso)).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function ArticleTodo({ doc, status, unsaved, reviewer, setReviewer, errors, busy, onValidate, onPublish, onImage, detailAlerts, onAutoFix, onUseKeyword }: { doc: Raw; status: string; unsaved: number; reviewer: string; setReviewer: (v: string) => void; errors: string[]; busy: boolean; onValidate: (withoutImage?: boolean) => void; onPublish: () => void; onImage: () => void; detailAlerts?: string[]; onAutoFix: () => void; onUseKeyword: (k: string) => void }) {
  const hasImage = Boolean(doc.featuredImageUrl || doc.featuredMediaId);
  const perf = doc.performance as { verdict?: string; label?: string; why?: string; action?: string; suggestedKeyword?: string | null } | undefined;
  const reviewing = status === "a-relire" || status === "a-verifier";
  const blocking = (detailAlerts ?? []).length;
  const live = status === "publie" || status === "a-rafraichir";
  const [imageOpen, setImageOpen] = useState(!hasImage && (reviewing || status === "image"));
  const canUpload = reviewing || (Boolean(Number(doc.wpId)) && ["image", "pret", "programme", "publie", "a-rafraichir"].includes(status));
  const title = status === "a-verifier" ? "À faire : corriger, relire et valider" : reviewing ? "À faire : relire et valider" : status === "image" ? "À faire : l'image principale" : status === "programme" ? "Programmé" : live ? "En ligne" : (articleStatusMeta(status)?.label ?? status);
  const hint = status === "a-verifier"
    ? "Le contrôle a bloqué ce texte. Corrigez les points en rouge directement dans le document, enregistrez, puis complétez ces points et validez."
    : reviewing
    ? "Relisez et corrigez le texte dans le document ci-dessous, puis complétez ces points et validez."
    : status === "image"
      ? "Le texte est validé : déposez l'image, l'article prend ensuite le prochain créneau (mardi ou jeudi, 9 h)."
      : status === "programme" && doc.scheduledAt
        ? `Publication prévue le ${longDate(doc.scheduledAt)} (créneaux du mardi et du jeudi, 9 h).`
        : (articleStatusMeta(status)?.hint ?? "");
  const onlyImageMissing = errors.length === 1 && /image/i.test(errors[0]) && reviewer && !unsaved;

  return (
    <section className={`todo todo--${status}`} aria-label="À faire">
      <div className="todo__head">
        <div>
          <strong>{title}</strong>
          <span>{hint}</span>
        </div>
        <div className="todo__cta">
          {reviewing && (
            <button type="button" className="cdx-btn cdx-btn--validate" disabled={busy} onClick={() => onValidate(false)}>
              {busy ? "Validation…" : "✓ Valider le texte"}
            </button>
          )}
          {status === "programme" && (
            <button type="button" className="cdx-btn cdx-btn--validate" disabled={busy} onClick={onPublish}>
              {busy ? "Publication…" : "Publier maintenant"}
            </button>
          )}
        </div>
      </div>

      <ul className="todo__list">
        {(status === "a-verifier" || blocking > 0) && (
          <li className={blocking ? "is-ko" : "is-ok"}>
            <span className="todo__mark">{blocking ? "!" : "✓"}</span>
            <span className="todo__label">Contrôle</span>
            <span className="todo__value">
              {blocking ? `${blocking} point${blocking > 1 ? "s" : ""} à corriger (liste en rouge à droite).` : "Plus rien de bloquant."}
              {blocking > 0 && (
                <button type="button" className="cdx-btn cdx-btn--primary cdx-btn--sm" onClick={onAutoFix}>
                  Corriger automatiquement
                </button>
              )}
            </span>
          </li>
        )}
        {reviewing && (
          <li className={unsaved ? "is-ko" : "is-ok"}>
            <span className="todo__mark">{unsaved ? "!" : "✓"}</span>
            <span className="todo__label">Texte</span>
            <span className="todo__value">{unsaved ? `${unsaved} modification${unsaved > 1 ? "s" : ""} non enregistrée${unsaved > 1 ? "s" : ""} : cliquez « Enregistrer » en haut à droite.` : "Relu et enregistré (corrigez directement dans le document)."}</span>
          </li>
        )}
        {reviewing && (
          <li className={reviewer ? "is-ok" : "is-todo"}>
            <span className="todo__mark">{reviewer ? "✓" : "1"}</span>
            <span className="todo__label">Relu par</span>
            <span className="todo__value">
              <select value={reviewer} onChange={(e) => setReviewer(e.target.value)} aria-label="Relecteur">
                <option value="">Choisir le relecteur…</option>
                {WP_REVIEWER_LIST.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </span>
          </li>
        )}
        {live && perf && perf.verdict !== "hors-ligne" && (
          <li className={`todo__perf is-${perf.verdict}`}>
            <span className="todo__mark">{perf.verdict === "performe" ? "✓" : perf.verdict === "a-ameliorer" ? "✗" : perf.verdict === "moyen" ? "~" : "…"}</span>
            <span className="todo__label">Performance</span>
            <span className="todo__value todo__value--stack">
              <strong>{perf.label}</strong>
              <span>{perf.why}</span>
              {perf.action && perf.action !== "—" && <span className="todo__action">→ {perf.action}</span>}
              {perf.suggestedKeyword && (
                <button type="button" className="cdx-btn cdx-btn--primary cdx-btn--sm" onClick={() => onUseKeyword(String(perf.suggestedKeyword))}>
                  Utiliser « {perf.suggestedKeyword} » comme mot-clé
                </button>
              )}
            </span>
          </li>
        )}
        {live && Array.isArray(doc.changesLog) && (doc.changesLog as Raw[]).length > 0 && (
          <li className="todo__perf">
            <span className="todo__mark">↻</span>
            <span className="todo__label">Modifications</span>
            <span className="todo__value todo__value--stack">
              {(doc.changesLog as Raw[])
                .slice(-4)
                .reverse()
                .map((e, i) => (
                  <span key={i}>
                    <strong className={`todo__verdict is-${String(e.annulee ? "annulee" : (e.verdict ?? "attente"))}`}>{e.annulee ? "Annulée" : e.verdict === "mieux" ? "✓ Mieux" : e.verdict === "moins-bien" ? "✗ Moins bien" : e.verdict === "stable" ? "= Stable" : "En attente"}</strong>{" "}
                    {new Date(String(e.le)).toLocaleDateString("fr-FR")} · {String(e.detail ?? "")}
                    {e.lecture ? ` — ${String(e.lecture)}` : !e.verdict && !e.annulee ? " — verdict 4 semaines après." : ""}
                  </span>
                ))}
            </span>
          </li>
        )}
        {!reviewing && doc.reviewedBy ? (
          <li className="is-ok">
            <span className="todo__mark">✓</span>
            <span className="todo__label">Relu par</span>
            <span className="todo__value">
              {String(doc.reviewedBy)}
              {doc.reviewedOn ? ` le ${new Date(String(doc.reviewedOn)).toLocaleDateString("fr-FR")}` : ""}
            </span>
          </li>
        ) : null}
        {(
          <li className={hasImage ? "is-ok" : "is-todo"}>
            <span className="todo__mark">{hasImage ? "✓" : reviewing ? "2" : "!"}</span>
            <span className="todo__label">Image</span>
            <span className="todo__value">
              {hasImage ? (
                <>
                  {doc.featuredImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vignette de la médiathèque WordPress
                    <img className="todo__thumb" src={String(doc.featuredImageUrl)} alt="" />
                  ) : null}
                  <span>{reviewing && !Number(doc.wpId) ? "Déposée (posée sur l'article à la validation)." : "Posée sur l'article dans WordPress."}</span>
                </>
              ) : (
                <span>Pas encore d'image.</span>
              )}
              {canUpload && (
                <button type="button" className="imgp__link" onClick={() => setImageOpen((v) => !v)}>
                  {imageOpen ? "Fermer" : hasImage ? "Remplacer" : "Ajouter l'image"}
                </button>
              )}
            </span>
          </li>
        )}
      </ul>

      {imageOpen && canUpload && (
        <div className="todo__image">
          <ImagePanel
            articleId={String(doc.id)}
            canUpload
            image={{ url: (doc.featuredImageUrl as string) ?? null, alt: (doc.imageAlt as string) ?? null, width: (doc.imageWidth as number) ?? null, bytes: (doc.imageBytes as number) ?? null, mime: (doc.imageMime as string) ?? null }}
            onDone={() => {
              setImageOpen(false);
              onImage();
            }}
          />
        </div>
      )}

      {errors.length > 0 && (
        <div className="todo__errors" role="alert">
          <strong>Il manque quelque chose :</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {onlyImageMissing && (
            <button type="button" className="imgp__link" onClick={() => onValidate(true)}>
              Valider sans image (elle se déposera ensuite)
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ArticleDocument({ s, set, original, link, doc }: { s: ArticleState; set: (f: (p: ArticleState) => ArticleState) => void; original: ArticleState; link: string | null; doc: Raw }) {
  const setAcf = (k: string, v: unknown) => set((p) => ({ ...p, acf: { ...p.acf, [k]: v } }));
  const blocks = arr(s.acf.contenu);
  const faq = arr(s.acf.faq);
  const sources = arr(s.acf.sources);
  const methode = obj(s.acf.methode);
  return (
    <>
      <label className={`cdx-keyword${s.keyword !== original.keyword ? " is-changed" : ""}`}>
        <span aria-hidden="true">🎯</span>
        <span className="cdx-sr">Mot-clé visé</span>
        <input value={s.keyword} placeholder="Mot-clé visé" style={{ width: `${Math.max(14, s.keyword.length + 2)}ch` }} onChange={(e) => set((p) => ({ ...p, keyword: e.target.value }))} />
      </label>
      <textarea className={`cdx-h1${s.title !== original.title ? " is-changed" : ""}`} rows={2} value={s.title} aria-label="Titre de l'article (H1)" placeholder="Titre de l'article" onChange={(e) => set((p) => ({ ...p, title: e.target.value }))} />
      <SerpPreview s={s} set={set} link={link} changed={s.seoTitle !== original.seoTitle || s.seoDescription !== original.seoDescription} />
      <DocSection label="Image principale">
        {doc.featuredImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- aperçu de la médiathèque WordPress
          <img className="cdx-hero" src={String(doc.featuredImageUrl)} alt={String(doc.imageAlt ?? "")} />
        ) : (
          <p className="cdx-muted">Pas encore d'image : elle se dépose dans l'encadré « À faire », en haut.</p>
        )}
      </DocSection>

      <DocSection label="Introduction" changed={!same(s.acf.introduction, original.acf.introduction)}>
        <HtmlEditor value={String(s.acf.introduction ?? "")} onChange={(v) => setAcf("introduction", v)} />
      </DocSection>
      {blocks.map((b, i) => (
        <DocSection key={i} label={`Section ${i + 1}`} changed={!same(b, arr(original.acf.contenu)[i])}>
          {typeof b.texte === "string" ? (
            <HtmlEditor value={b.texte} minHeight={120} onChange={(v) => setAcf("contenu", blocks.map((x, j) => (j === i ? { ...x, texte: v } : x)))} />
          ) : (
            <p className="cdx-muted">Bloc « {String(b.acf_fc_layout ?? "?")} » : se modifie dans WordPress.</p>
          )}
        </DocSection>
      ))}
      <DocSection label="Conclusion" changed={!same(s.acf.conclusion, original.acf.conclusion)}>
        <HtmlEditor value={String(s.acf.conclusion ?? "")} onChange={(v) => setAcf("conclusion", v)} />
      </DocSection>

      <DocSection label={`FAQ · ${faq.length}`} changed={!same(s.acf.faq, original.acf.faq)}>
        {faq.map((q, i) => (
          <div key={i} className="cdx-faq">
            <div className="cdx-faq__q">
              <input value={String(q.titre ?? "")} placeholder="Question" aria-label={`Question ${i + 1}`} onChange={(e) => setAcf("faq", faq.map((x, j) => (j === i ? { ...x, titre: e.target.value } : x)))} />
              <button type="button" className="cdx-icon" aria-label={`Retirer la question ${i + 1}`} onClick={() => setAcf("faq", faq.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
            <HtmlEditor key={`faq-${faq.length}-${i}`} value={String(q.text ?? "")} minHeight={60} onChange={(v) => setAcf("faq", faq.map((x, j) => (j === i ? { ...x, text: v } : x)))} />
          </div>
        ))}
        <button type="button" className="cdx-add" onClick={() => setAcf("faq", [...faq, { titre: "", text: "<p><strong></strong></p>" }])}>
          + Ajouter une question
        </button>
      </DocSection>

      <DocSection label={`Sources · ${sources.length}`} changed={!same(s.acf.sources, original.acf.sources)}>
        {sources.map((src, i) => (
          <div key={i} className="cdx-source">
            <input value={String(src.libelle ?? "")} placeholder="Organisme, titre de la page" aria-label={`Source ${i + 1} : libellé`} onChange={(e) => setAcf("sources", sources.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))} />
            <input value={String(src.url ?? "")} placeholder="https://… (page précise)" aria-label={`Source ${i + 1} : adresse`} onChange={(e) => setAcf("sources", sources.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            <input className="cdx-source__year" value={String(src.date ?? "")} placeholder="Année" aria-label={`Source ${i + 1} : année`} onChange={(e) => setAcf("sources", sources.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
            <button type="button" className="cdx-icon" aria-label={`Retirer la source ${i + 1}`} onClick={() => setAcf("sources", sources.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="cdx-add" onClick={() => setAcf("sources", [...sources, { libelle: "", url: "", date: "" }])}>
          + Ajouter une source
        </button>
      </DocSection>

      <p className="cdx-method">
        Relu par {reviewerName(methode.relu_par) || "—"} le {String(methode.relu_le || "—")} · mis à jour le {String(s.acf.date_mise_a_jour || "—")} · assistance IA : {methode.assistance_ia ? "oui" : "non"}
      </p>
    </>
  );
}

// ── Le document : fiche métier ───────────────────────────────────────────────

function JobDocument({ title, acf, setAcf, original }: { title: string; acf: Raw; setAcf: (k: string, v: unknown) => void; original: Raw }) {
  const vals = (v: unknown) => arr(v);
  const info = obj(acf.informations_cles);
  const stats = obj(acf.statistiques);
  const sal = obj(acf.salaires);
  const cert = obj(acf.certifications);
  const faq = obj(acf.faq);
  const items = arr(faq.items);
  const words = String(acf.definition ?? "").trim().split(/\s+/).filter(Boolean).length;
  const list = (key: string, label: string) => (
    <DocSection label={label} changed={!same(acf[key], original[key])}>
      <div className="cdx-chips">
        {vals(acf[key]).map((v, i) => (
          <span key={i} className="cdx-chip cdx-chip--edit">
            <input value={String(v.valeur ?? "")} aria-label={`${label} ${i + 1}`} onChange={(e) => setAcf(key, vals(acf[key]).map((x, j) => (j === i ? { ...x, valeur: e.target.value } : x)))} />
            <button type="button" className="cdx-icon" aria-label={`Retirer ${label} ${i + 1}`} onClick={() => setAcf(key, vals(acf[key]).filter((_, j) => j !== i))}>
              ✕
            </button>
          </span>
        ))}
        <button type="button" className="cdx-add" onClick={() => setAcf(key, [...vals(acf[key]), { valeur: "" }])}>
          + Ajouter
        </button>
      </div>
    </DocSection>
  );
  return (
    <>
      <h2 className="cdx-h1 cdx-h1--static">{title}</h2>
      <DocSection label="Définition" changed={!same(acf.definition, original.definition)}>
        <textarea className="cdx-plain" rows={4} value={String(acf.definition ?? "")} onChange={(e) => setAcf("definition", e.target.value)} />
        <LengthBar n={words} min={40} max={60} unit="mots" />
      </DocSection>
      {list("synonymes", "Synonymes")}
      {list("points_cles", "Points clés")}
      <DocSection label="Chiffres France Travail · lecture seule">
        <div className="cdx-stats cdx-stats--wrap">
          {[...arr(info.items).map((x) => [String(x.label), `${String(x.value ?? "—")} ${String(x.unit ?? "")}`]), ...arr(stats.items).map((x) => [String(x.label), String(x.valeur ?? "—")]), ...arr(sal.medians).map((x) => [`Salaire médian ${String(x.label)}`, `${String(x.valeur ?? "—")} €`])].map(([l, v], i) => (
            <div key={i}>
              <strong>{v}</strong>
              <span>{l}</span>
            </div>
          ))}
        </div>
        <p className="cdx-hint">Mis à jour le {String(acf.derniere_mise_a_jour ?? "—")} · rafraîchis une fois par an, jamais à la main.</p>
      </DocSection>
      <DocSection label={`Certifications · ${arr(cert.items).length} · lecture seule`}>
        <ul className="cdx-list">
          {arr(cert.items).map((c, i) => (
            <li key={i}>
              {String(c.intitule)} {c.niveau ? `· ${String(c.niveau)}` : ""} {c.duree ? `· ${String(c.duree)}` : ""}
            </li>
          ))}
        </ul>
      </DocSection>
      <DocSection label={`FAQ · ${items.length}`} changed={!same(acf.faq, original.faq)}>
        {items.map((q, i) => (
          <div key={i} className="cdx-faq">
            <div className="cdx-faq__q">
              <input value={String(q.question ?? "")} placeholder="Question" aria-label={`Question ${i + 1}`} onChange={(e) => setAcf("faq", { ...faq, items: items.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
              <button type="button" className="cdx-icon" aria-label={`Retirer la question ${i + 1}`} onClick={() => setAcf("faq", { ...faq, items: items.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
            <textarea className="cdx-plain" rows={3} value={String(q.reponse ?? "")} aria-label={`Réponse ${i + 1}`} onChange={(e) => setAcf("faq", { ...faq, items: items.map((x, j) => (j === i ? { ...x, reponse: e.target.value } : x)) })} />
          </div>
        ))}
        <button type="button" className="cdx-add" onClick={() => setAcf("faq", { ...faq, items: [...items, { question: "", reponse: "" }] })}>
          + Ajouter une question
        </button>
      </DocSection>
    </>
  );
}

// ── Tiroir ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { publie: "Publié", "a-rafraichir": "À rafraîchir", "a-relire": "À relire", "a-verifier": "À vérifier", image: "Image à faire", programme: "Programmé", redaction: "En rédaction", validee: "Validée", idee: "Idée", publiee: "Publiée" };

export function ContentDrawer({ collection, id, onClose }: { collection: "articles" | "job-sheets"; id: number | string; onClose: () => void }) {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const [doc, setDoc] = useState<Raw | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [art, setArt] = useState<ArticleState | null>(null);
  const [jobAcf, setJobAcf] = useState<Raw | null>(null);
  const [live, setLive] = useState<Detail | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [comp, setComp] = useState<Comp | null>(null);
  const [cov, setCov] = useState<Coverage | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const isArticle = collection === "articles";

  const loadComp = useCallback(() => {
    fetch(`${api}/${collection}/${id}/competitors`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: Comp & { error?: string }) => setComp(d.error ? { keyword: "", configured: false, snapshot: null } : d))
      .catch(() => setComp({ keyword: "", configured: false, snapshot: null }));
  }, [api, collection, id]);
  useEffect(loadComp, [loadComp]);

  const analyze = async () => {
    setAnalyzing(true);
    setMessage(null);
    try {
      const r = await fetch(`${api}/${collection}/${id}/competitors`, { method: "POST", credentials: "include" });
      const d = (await r.json()) as Comp & { error?: string };
      if (!r.ok || d.error) throw new Error(d.error ?? `Erreur ${r.status}`);
      setComp(d);
    } catch (e) {
      setMessage({ text: `Analyse impossible : ${e instanceof Error ? e.message : String(e)}`, ok: false });
    } finally {
      setAnalyzing(false);
    }
  };

  const load = useCallback(() => {
    fetch(`${api}/${collection}/${id}?depth=0`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Erreur ${r.status}`))))
      .then((d: Raw) => {
        setDoc(d);
        if (collection === "articles") setArt(articleState(d));
        else setJobAcf(structuredClone(obj(d.acf)));
        setLive(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [api, collection, id]);
  useEffect(load, [load]);

  const original = useMemo(() => (doc ? (isArticle ? articleState(doc) : null) : null), [doc, isArticle]);
  const originalJob = useMemo(() => (doc ? obj(doc.acf) : {}), [doc]);

  // Ce qui a changé, champ par champ.
  const changes = useMemo(() => {
    if (!doc) return [] as { key: string; label: string; before: string; after: string }[];
    const out: { key: string; label: string; before: string; after: string }[] = [];
    const txt = (v: unknown) => clip(htmlToText(typeof v === "string" ? v : JSON.stringify(v ?? "")));
    const LABELS: Record<string, string> = { introduction: "Introduction", contenu: "Sections", conclusion: "Conclusion", faq: "FAQ", sources: "Sources", definition: "Définition", synonymes: "Synonymes", points_cles: "Points clés" };
    if (isArticle && art && original) {
      if (art.title !== original.title) out.push({ key: "title", label: "Titre", before: original.title, after: art.title });
      if (art.seoTitle !== original.seoTitle) out.push({ key: "seoTitle", label: "Titre SEO", before: original.seoTitle, after: art.seoTitle });
      if (art.seoDescription !== original.seoDescription) out.push({ key: "seoDescription", label: "Méta description", before: original.seoDescription, after: art.seoDescription });
      if (art.keyword !== original.keyword) out.push({ key: "keyword", label: "Mot-clé", before: original.keyword, after: art.keyword });
      for (const k of ["introduction", "contenu", "conclusion", "faq", "sources"]) if (!same(art.acf[k], original.acf[k])) out.push({ key: `acf.${k}`, label: LABELS[k], before: txt(original.acf[k]), after: txt(art.acf[k]) });
    } else if (jobAcf) {
      for (const k of ["definition", "synonymes", "points_cles", "faq"]) if (!same(jobAcf[k], originalJob[k])) out.push({ key: `acf.${k}`, label: LABELS[k], before: txt(originalJob[k]), after: txt(jobAcf[k]) });
    }
    return out;
  }, [doc, isArticle, art, original, jobAcf, originalJob]);

  // Le contenu tel qu'il est dans le tiroir (avec les modifications en cours).
  const mergedDoc = useCallback((): Raw => {
    if (!doc) return {};
    if (isArticle && art) return { ...doc, title: art.title, seoTitle: art.seoTitle, seoDescription: art.seoDescription, keyword: art.keyword, ...(Object.keys(obj(doc.acf)).length ? { acf: art.acf } : { draft: { ...art.acf, title: art.title, yoast_title: art.seoTitle, yoast_description: art.seoDescription } }) };
    return { ...doc, acf: jobAcf };
  }, [doc, isArticle, art, jobAcf]);

  // La couverture concurrents, recalculée pendant la frappe (0,5 s après la dernière modification).
  useEffect(() => {
    const corpus = comp?.snapshot?.corpus;
    if (!doc || !corpus) {
      setCov(null);
      return;
    }
    const t = setTimeout(() => {
      const input = isArticle ? articleCoverageInput(mergedDoc()) : jobCoverageInput(mergedDoc());
      setCov(coverage(input.text, corpus, input.headings));
    }, 500);
    return () => clearTimeout(t);
  }, [doc, comp, isArticle, mergedDoc]);

  // La note, recalculée pendant la frappe (0,8 s après la dernière modification).
  useEffect(() => {
    if (!doc || !changes.length) {
      setLive(null);
      return;
    }
    const t = setTimeout(() => {
      const detail = obj(doc.scoreDetail) as unknown as Detail;
      const criteria = criteriaFromDetail(detail, isArticle ? "article" : "fiche");
      if (!criteria.length) return;
      const merged = mergedDoc();
      const input = isArticle ? articleScoreInput(merged, new Date()) : jobScoreInput(merged, new Date());
      setLive(toDetail(scoreContent(input, criteria)));
    }, 800);
    return () => clearTimeout(t);
  }, [doc, changes.length, isArticle, mergedDoc]);

  const save = async () => {
    if (!changes.length) return;
    setBusy(true);
    setMessage(null);
    const body: Raw = {};
    if (isArticle && art) {
      const acf: Raw = {};
      for (const c of changes) {
        if (c.key.startsWith("acf.")) acf[c.key.slice(4)] = art.acf[c.key.slice(4)];
        else body[c.key] = art[c.key as keyof ArticleState];
      }
      if (Object.keys(acf).length) body.acf = acf;
    } else if (jobAcf) {
      body.acf = Object.fromEntries(changes.map((c) => [c.key.slice(4), jobAcf[c.key.slice(4)]]));
    }
    try {
      const res = await fetch(`${api}/${collection}/${id}/content`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      setMessage({ text: Number(doc?.wpId) ? "Enregistré dans WordPress, relu et vérifié. Notes recalculées." : "Enregistré dans le support (pas encore dans WordPress). Notes recalculées.", ok: true });
      setShowDiff(false);
      load();
      loadComp();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  // « Publier maintenant » : sans attendre le créneau du mardi ou du jeudi.
  const publishNow = async () => {
    if (!window.confirm("Publier cet article maintenant sur tim-management.co, sans attendre son créneau ?")) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${api}/articles/${id}/decision`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publier-maintenant" }) });
      const out = (await res.json().catch(() => ({}))) as { error?: string; link?: string };
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      setMessage({ text: `Article publié${out.link ? ` : ${out.link}` : ""}.`, ok: true });
      load();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  // « Valider le texte » depuis le tiroir (19/11/2026). Ce qui manque est dit, pas grisé en silence.
  const [reviewer, setReviewer] = useState("");
  const [todoErrors, setTodoErrors] = useState<string[]>([]);
  // Recharge les éditeurs après une correction automatique (ils ne lisent le texte qu'à l'ouverture).
  const [docRev, setDocRev] = useState(0);
  useEffect(() => {
    const known = WP_REVIEWER_LIST.find((r) => r.name === String(doc?.reviewedBy ?? ""));
    if (known) setReviewer(known.name);
  }, [doc?.reviewedBy]);
  const validateText = async (withoutImage = false) => {
    const missing = [
      changes.length ? "Enregistrez vos modifications (bouton « Enregistrer » en haut à droite)." : null,
      !reviewer ? "Choisissez le relecteur." : null,
      !doc?.featuredMediaId && !withoutImage ? "Déposez l'image principale, ou cliquez « Valider sans image »." : null,
    ].filter(Boolean) as string[];
    setTodoErrors(missing);
    if (missing.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${api}/articles/${id}/decision`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "valider-texte", reviewer, withoutImage }) });
      const out = (await res.json().catch(() => ({}))) as { error?: string; scheduledAt?: string | null };
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      setMessage({ text: out.scheduledAt ? `Texte validé, image posée : publication prévue le ${new Date(out.scheduledAt).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.` : "Texte validé : le brouillon WordPress est créé. Il reste l'image principale.", ok: true });
      load();
    } catch (e) {
      setTodoErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setBusy(false);
    }
  };

  const detail = live ?? (obj(doc?.scoreDetail) as unknown as Detail);

  // Les passages à corriger, surlignés en rouge dans le document (sans toucher au texte enregistré).
  const issuesKey = (detail?.alertes ?? []).join("|");
  useEffect(() => {
    const roots = Array.from(document.querySelectorAll(".cdx-page .hed__area"));
    const t = setTimeout(() => highlightIn(roots, quotedPassages(detail?.alertes ?? [])), 50);
    return () => {
      clearTimeout(t);
      clearHighlights();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relancé quand les alertes ou le document changent
  }, [issuesKey, docRev, doc]);

  // « Corriger automatiquement » : marque réécrite, phrases de promesse retirées. Rien n'est enregistré.
  const autoFix = () => {
    if (!art) return;
    const res = autoFixArticle(art.acf as Raw, detail?.alertes ?? []);
    setArt({ ...art, acf: res.acf as ArticleState["acf"], title: fixBrand(art.title), seoTitle: fixBrand(art.seoTitle), seoDescription: fixBrand(art.seoDescription) });
    setDocRev((r) => r + 1);
    setTodoErrors([]);
    const done = [res.brandFixed ? `marque réécrite « TIM Management » (${res.brandFixed})` : null, res.removed ? `${res.removed} phrase${res.removed > 1 ? "s" : ""} de promesse retirée${res.removed > 1 ? "s" : ""}` : null].filter(Boolean).join(", ");
    setMessage({
      text: `${done ? `Corrigé : ${done}.` : "Rien à corriger automatiquement."}${res.notFound.length ? ` Introuvable, à retirer à la main : « ${res.notFound[0].slice(0, 120)}… ».` : ""} Relisez, puis cliquez « Enregistrer dans WordPress ».`,
      ok: !res.notFound.length,
    });
  };
  const title = isArticle ? (art?.title ?? String(doc?.title ?? "")) : String(doc?.title ?? "");
  const status = String(doc?.status ?? "");
  return (
    <Drawer label={title || "Contenu"} onClose={onClose} wide>
      <div className="cdx">
        {error && <p className="cdx-empty">Contenu illisible : {error}</p>}
        {!doc && !error && <p className="cdx-empty">Chargement…</p>}
        {doc && (
          <>
            <header className="cdx-top">
              <div className="cdx-top__id">
                <span className="cdx-eyebrow">{isArticle ? "Article" : "Fiche métier"}</span>
                <strong title={title}>{title}</strong>
                {status && <span className="cdx-status">{STATUS_LABEL[status] ?? status}</span>}
              </div>
              <div className="cdx-top__actions">
                {doc.wpLink ? (
                  <a className="cdx-btn cdx-btn--ghost" href={String(doc.wpLink)} target="_blank" rel="noreferrer">
                    Voir sur le site ↗
                  </a>
                ) : null}
                <button type="button" className="cdx-btn cdx-btn--ghost" disabled={!changes.length || busy} onClick={() => setShowDiff((v) => !v)} aria-expanded={showDiff}>
                  {changes.length ? `${changes.length} changement${changes.length > 1 ? "s" : ""}` : "Aucun changement"}
                </button>
                <button type="button" className="cdx-btn cdx-btn--primary" disabled={!changes.length || busy} onClick={save}>
                  {busy ? "Enregistrement…" : Number(doc.wpId) ? "Enregistrer dans WordPress" : "Enregistrer"}
                </button>
              </div>
            </header>
            {isArticle && TODO_STATUSES.includes(status) && (
              <ArticleTodo
                doc={doc}
                status={status}
                unsaved={changes.length}
                reviewer={reviewer}
                setReviewer={(v) => {
                  setReviewer(v);
                  setTodoErrors([]);
                }}
                errors={todoErrors}
                detailAlerts={detail?.alertes}
                onAutoFix={autoFix}
                onUseKeyword={(k) => {
                  if (!art) return;
                  setArt({ ...art, keyword: k });
                  setMessage({ text: `Mot-clé remplacé par « ${k} ». Adaptez le titre et la description Google (« Modifier » de l'aperçu), puis « Enregistrer dans WordPress » : le changement sera mesuré 4 semaines après.`, ok: true });
                }}
                busy={busy}
                onValidate={validateText}
                onPublish={publishNow}
                onImage={() => {
                  setTodoErrors([]);
                  load();
                }}
              />
            )}
            {(message || (showDiff && changes.length > 0)) && (
              <div className="cdx-notices">
                {message && <p className={`cdx-msg${message.ok ? " is-ok" : " is-ko"}`}>{message.text}</p>}
                {showDiff &&
                  changes.map((c) => (
                    <div key={c.key} className="cdx-diff">
                      <strong>{c.label}</strong>
                      <p className="cdx-diff__before">{c.before || "(vide)"}</p>
                      <p className="cdx-diff__after">{c.after || "(vide)"}</p>
                    </div>
                  ))}
              </div>
            )}
            <div className="cdx-grid">
              <main className="cdx-canvas">
                <div className="cdx-page">
                  {isArticle && art && original ? (
                    <ArticleDocument key={docRev} s={art} set={(f) => setArt((p) => (p ? f(p) : p))} original={original} link={doc.wpLink ? String(doc.wpLink) : null} doc={doc} />
                  ) : jobAcf ? (
                    <JobDocument title={String(doc.title ?? "")} acf={jobAcf} original={originalJob} setAcf={(k, v) => setJobAcf((p) => ({ ...(p ?? {}), [k]: v }))} />
                  ) : null}
                </div>
              </main>
              <OptimisationPanel detail={detail} version={doc.scoreRulesVersion} live={Boolean(live)} comp={comp} cov={cov} onAnalyze={analyze} analyzing={analyzing} />
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
