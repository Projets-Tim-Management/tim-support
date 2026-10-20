"use client";

import { toast } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { AI_SHARE_MAX_PCT } from "@/modules/ads/agent/limits";
import { draftFromDoc, emptyDraft, resumeStep, stepData, stepProblems, suggestedRunObjective, WIZARD_STEPS, type StepKey, type WizardDraft } from "@/modules/ads/lib/campaign-wizard";
import { OBJECTIVES } from "@/modules/ads/lib/campaign-options";
import { CTA_OPTIONS } from "@/modules/ads/lib/cta";
import { TONES } from "@/modules/ads/lib/dimensions";

import { postAdmin } from "./post-admin";

/**
 * Nouvelle campagne, pas à pas (demande de Charlie, 20/10/2026). Une fenêtre en
 * six étapes ; « Suivant » enregistre l'étape — la première crée le brouillon —,
 * si bien qu'une fenêtre fermée se rouvre à la première étape incomplète. Ce qui
 * est obligatoire, et pourquoi on ne peut pas avancer, vient de lib/campaign-wizard.
 * La dernière étape relit tout et lance (ou non) l'agent.
 */

type Option = { id: number | string; label: string };
type Preview = { lancable: boolean; blocages: string[]; budget: { coutMaximalEur: number } };

const AUTONOMY = [
  { value: "observer", label: "Observer", help: "Il rapporte, il n'agit pas." },
  { value: "proposer", label: "Proposer", help: "Chaque action passe par « À valider »." },
  { value: "autonome", label: "Autonome", help: "Il agit seul, dans les garde-fous." },
];
const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const num = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(",", ".")));

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  const data = (await res.json().catch(() => ({}))) as T & { errors?: { message?: string; data?: { errors?: { message?: string }[] } }[]; error?: string };
  if (!res.ok) throw new Error(data.errors?.[0]?.data?.errors?.[0]?.message || data.errors?.[0]?.message || data.error || `Erreur ${res.status}`);
  return data;
}

export function CampaignWizard({ campaignId, onClose }: { campaignId: number | string | null; onClose: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<WizardDraft>(emptyDraft);
  const [step, setStep] = useState<StepKey>("bases");
  const [loaded, setLoaded] = useState(false);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [facts, setFacts] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [runObjective, setRunObjective] = useState("");
  const [capEur, setCapEur] = useState("2");

  // Ce qu'on choisit (comptes, preuves) et, pour une reprise, la campagne elle-même.
  useEffect(() => {
    let alive = true;
    void Promise.all([
      api<{ docs: { id: number; name: string; status?: string }[] }>("/api/ad-accounts?limit=50&depth=0"),
      api<{ docs: { id: number; statement: string }[] }>("/api/ad-facts?limit=200&depth=0&where[active][equals]=true"),
      campaignId != null ? api<Record<string, unknown>>(`/api/ad-campaigns/${encodeURIComponent(String(campaignId))}?depth=0`) : Promise.resolve(null),
    ])
      .then(([acc, f, doc]) => {
        if (!alive) return;
        const usable = acc.docs.filter((a) => a.status !== "archive");
        setAccounts(usable.map((a) => ({ id: a.id, label: a.name })));
        setFacts(f.docs.map((x) => ({ id: x.id, label: x.statement })));
        const draft = doc ? draftFromDoc(doc as never) : { ...emptyDraft(), account: usable.length === 1 ? usable[0].id : null };
        setD(draft);
        setStep(doc ? resumeStep(draft) : "bases");
        setLoaded(true);
      })
      .catch((e: Error) => toast.error(e.message));
    return () => {
      alive = false;
    };
  }, [campaignId]);

  const index = WIZARD_STEPS.findIndex((s) => s.key === step);
  const problems = useMemo(() => stepProblems(step, d), [step, d]);
  const set = <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  // À l'étape « Vérifier » : ce que l'agent lirait, ce que le passage coûterait au plus, ce qui bloquerait.
  useEffect(() => {
    if (step !== "verifier" || d.id == null) return;
    if (!runObjective) setRunObjective(suggestedRunObjective(d));
    const t = setTimeout(() => {
      api<{ preview: Preview }>(`/api/admin/ads/campaigns/${encodeURIComponent(String(d.id))}/agent?cap=${encodeURIComponent(capEur)}`)
        .then((r) => setPreview(r.preview))
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(t);
  }, [step, d, capEur, runObjective]);

  /** Enregistre l'étape en cours ; crée le brouillon à la première. Rend l'identifiant. */
  const save = async (): Promise<number | string> => {
    const data = stepData(step, d);
    if (d.id == null) {
      const r = await api<{ doc: { id: number } }>("/api/ad-campaigns", { method: "POST", body: JSON.stringify(data) });
      set("id", r.doc.id);
      return r.doc.id;
    }
    if (Object.keys(data).length) await api(`/api/ad-campaigns/${encodeURIComponent(String(d.id))}`, { method: "PATCH", body: JSON.stringify(data) });
    return d.id;
  };

  const go = async (to: number) => {
    if (to > index) {
      setTried(true);
      if (problems.length) return;
      setBusy(true);
      try {
        await save();
      } catch (e) {
        toast.error((e as Error).message);
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setTried(false);
    setStep(WIZARD_STEPS[to].key);
  };

  const finish = async (launch: boolean) => {
    if (d.id == null) return;
    setBusy(true);
    try {
      if (launch) {
        await postAdmin(`/api/admin/ads/campaigns/${encodeURIComponent(String(d.id))}/agent`, { objective: runObjective, capEur: Number(capEur) });
        toast.success("Campagne créée, agent lancé.");
      } else toast.success("Campagne créée.");
      onClose();
      router.push(`/admin/collections/ad-campaigns/${encodeURIComponent(String(d.id))}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;
  // Une étape déjà franchie se rouvre d'un clic ; on ne saute pas une étape incomplète.
  const reachable = (i: number) => i <= index || WIZARD_STEPS.slice(0, i).every((s) => s.key === "verifier" || !stepProblems(s.key, d).length);
  const labelOf = (list: readonly { label: string; value: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v;

  const body = !loaded ? (
    <p className="ads-wiz__muted">Chargement…</p>
  ) : step === "bases" ? (
    <>
      <Field label="Nom de la campagne" required>
        <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Pointage mobile — gérants PME BTP" autoFocus />
      </Field>
      <Field label="Compte publicitaire" required>
        <select value={d.account == null ? "" : String(d.account)} onChange={(e) => set("account", e.target.value ? Number(e.target.value) : null)}>
          <option value="">Choisir…</option>
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>
              {a.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ce que la campagne doit obtenir" required>
        <div className="ads-wiz__choices">
          {OBJECTIVES.filter((o) => o.value !== "autre").map((o) => (
            <label key={o.value} className={`ads-wiz__choice${d.objective === o.value ? " ads-wiz__choice--on" : ""}`}>
              <input type="radio" name="objective" checked={d.objective === o.value} onChange={() => set("objective", o.value)} />
              {o.value === "leads" ? "Des prospects" : o.label}
            </label>
          ))}
        </div>
      </Field>
    </>
  ) : step === "cible" ? (
    <>
      <Field label="Cible" required help="Qui ils sont, leur métier, la taille de l'entreprise, la zone.">
        <textarea rows={3} value={d.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Conducteurs de travaux et gérants de PME du BTP, 11 à 100 salariés, France" autoFocus />
      </Field>
      <Field label="Leur problème, dans leurs mots" required>
        <textarea rows={3} value={d.pain} onChange={(e) => set("pain", e.target.value)} placeholder="« Le pointage papier me coûte 2 h par semaine »" />
      </Field>
    </>
  ) : step === "offre" ? (
    <>
      <Field label="L'offre" required help="Les chiffres écrits ici (durées, prix) sont autorisés dans les textes.">
        <textarea rows={2} value={d.offer} onChange={(e) => set("offer", e.target.value)} placeholder="Démo de 30 minutes, sans engagement" autoFocus />
      </Field>
      <Field label="La promesse" required help="Ce qui change après — vérifiable.">
        <textarea rows={2} value={d.promise} onChange={(e) => set("promise", e.target.value)} placeholder="Les heures arrivent justes sur la paie, sans ressaisie" />
      </Field>
      <Field label="Preuves chiffrées autorisées" help={facts.length ? "Les seuls chiffres que les textes pourront citer, avec l'offre." : "Aucun fait sourcé actif : ajoutez-en dans Ressources › Faits sourcés."}>
        <div className="ads-wiz__checks">
          {facts.map((f) => (
            <label key={f.id}>
              <input type="checkbox" checked={d.proofs.map(String).includes(String(f.id))} onChange={(e) => set("proofs", e.target.checked ? [...d.proofs, f.id] : d.proofs.filter((p) => String(p) !== String(f.id)))} />
              {f.label}
            </label>
          ))}
        </div>
      </Field>
    </>
  ) : step === "pub" ? (
    <>
      <Field label="Page d'arrivée" required help="Où mène le clic. Une adresse complète en https://.">
        <input value={d.landingUrl} onChange={(e) => set("landingUrl", e.target.value)} placeholder="https://tim-management.co/…" autoFocus />
      </Field>
      <div className="ads-wiz__row">
        <Field label="Bouton d'action">
          <select value={d.cta} onChange={(e) => set("cta", e.target.value)}>
            {CTA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ton" help="Le tutoiement : en test étiqueté seulement.">
          <select value={d.tone} onChange={(e) => set("tone", e.target.value)}>
            {TONES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Angles souhaités" help="Facultatif, un par ligne. Vide, l'agent en propose trois.">
        <textarea rows={3} value={d.angles.join("\n")} onChange={(e) => set("angles", e.target.value.split("\n"))} placeholder={"La fin de la ressaisie du vendredi\nDes heures justes pour une paie juste"} />
      </Field>
      <Field label="Interdits de cette campagne" help="Facultatif, un par ligne. S'ajoutent à ceux du kit de marque.">
        <textarea rows={2} value={d.forbidden} onChange={(e) => set("forbidden", e.target.value)} />
      </Field>
    </>
  ) : step === "budget" ? (
    <>
      <div className="ads-wiz__row">
        <Field label="Budget par jour (€)" required help="IA et Meta ensemble. L'agent propose la répartition.">
          <input type="number" min="1" step="1" value={d.totalDailyEur ?? ""} onChange={(e) => set("totalDailyEur", num(e.target.value))} placeholder="10" autoFocus />
        </Field>
        <Field label="Plancher Meta (€/jour)" help="L'agent ne descend jamais la dépense Meta en dessous.">
          <input type="number" min="0" step="1" value={d.metaFloorEur ?? ""} onChange={(e) => set("metaFloorEur", num(e.target.value))} />
        </Field>
        <Field label="Part IA maximale (%)" help={`De 0 à ${AI_SHARE_MAX_PCT} %.`}>
          <input type="number" min="0" max={AI_SHARE_MAX_PCT} step="1" value={d.maxAiSharePct ?? ""} onChange={(e) => set("maxAiSharePct", num(e.target.value))} />
        </Field>
      </div>
      <Field label="Liberté de l'agent une fois en ligne" help="Quel que soit le choix : une hausse de plus de 20 % ou une réactivation se valident à la main.">
        <div className="ads-wiz__choices ads-wiz__choices--stack">
          {AUTONOMY.map((o) => (
            <label key={o.value} className={`ads-wiz__choice${d.autonomy === o.value ? " ads-wiz__choice--on" : ""}`}>
              <input type="radio" name="autonomy" checked={d.autonomy === o.value} onChange={() => set("autonomy", o.value)} />
              <strong>{o.label}</strong> <span>{o.help}</span>
            </label>
          ))}
        </div>
      </Field>
    </>
  ) : (
    <>
      <dl className="ads-wiz__recap">
        <Recap title="La campagne" onEdit={() => setStep("bases")}>
          {d.name} · {accounts.find((a) => String(a.id) === String(d.account))?.label ?? "—"} · {d.objective === "leads" ? "Des prospects" : labelOf(OBJECTIVES, d.objective)}
        </Recap>
        <Recap title="Cible" onEdit={() => setStep("cible")}>
          {d.audience}
          <br />
          <em>{d.pain}</em>
        </Recap>
        <Recap title="Offre" onEdit={() => setStep("offre")}>
          {d.offer} — {d.promise}
          {d.proofs.length ? ` · ${d.proofs.length} preuve(s)` : " · aucune preuve chiffrée"}
        </Recap>
        <Recap title="Pub" onEdit={() => setStep("pub")}>
          {d.landingUrl} · {labelOf(CTA_OPTIONS, d.cta)} · {labelOf(TONES, d.tone)}
          {d.angles.filter((a) => a.trim()).length ? ` · ${d.angles.filter((a) => a.trim()).length} angle(s)` : ""}
        </Recap>
        <Recap title="Budget" onEdit={() => setStep("budget")}>
          {d.totalDailyEur != null ? eur(d.totalDailyEur) : "—"} par jour · plancher Meta {d.metaFloorEur != null ? eur(d.metaFloorEur) : "—"} · {AUTONOMY.find((a) => a.value === d.autonomy)?.label}
        </Recap>
      </dl>
      <section className="ads-wiz__launch">
        <h3>Premier passage de l&apos;agent</h3>
        <p className="ads-wiz__muted">Il prépare le positionnement, les audiences, les textes et les briefs Claude Design, puis dépose les créas dans « À valider ». Rien n&apos;est publié chez Meta.</p>
        <Field label="Objectif de ce passage, en une phrase">
          <textarea rows={2} value={runObjective} onChange={(e) => setRunObjective(e.target.value)} />
        </Field>
        <Field label="Plafond de ce passage (€)">
          <input type="number" min="0.5" step="0.5" value={capEur} onChange={(e) => setCapEur(e.target.value)} />
        </Field>
        {preview && (
          <ul className="ads-wiz__facts">
            {preview.blocages.map((b) => (
              <li key={b} className="ads-wiz__bad">
                {b}
              </li>
            ))}
            <li>Coût maximal du passage : {eur(preview.budget.coutMaximalEur)}, aucun appel ne part au-delà.</li>
          </ul>
        )}
      </section>
    </>
  );

  const canLaunch = Boolean(preview?.lancable && runObjective.trim() && Number(capEur) > 0 && !busy);

  return createPortal(
    <div className="ads-wiz" role="dialog" aria-modal="true" aria-labelledby="ads-wiz-title">
      <div className="ads-wiz__panel">
        <header className="ads-wiz__head">
          <h2 id="ads-wiz-title">{campaignId != null ? "Compléter la campagne" : "Nouvelle campagne"}</h2>
          <button type="button" className="ads-wiz__close" onClick={onClose} aria-label="Fermer (ce qui est enregistré est gardé)" title="Fermer : les étapes déjà passées sont enregistrées">
            ✕
          </button>
        </header>
        <ol className="ads-wiz__steps">
          {WIZARD_STEPS.map((s, i) => {
            const state = i === index ? "on" : i < index || !stepProblems(s.key, d).length ? "done" : "todo";
            return (
              <li key={s.key} className={`ads-wiz__step ads-wiz__step--${state}`}>
                <button type="button" disabled={busy || !reachable(i) || i === index} onClick={() => void go(i)}>
                  <span className="ads-wiz__dot">{state === "done" && i !== index ? "✓" : i + 1}</span>
                  <span className="ads-wiz__step-label">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="ads-wiz__body">
          <h3 className="ads-wiz__title">
            {index + 1}. {WIZARD_STEPS[index].title}
          </h3>
          {body}
          {tried && problems.length > 0 && (
            <ul className="ads-wiz__problems" role="alert">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        <footer className="ads-wiz__foot">
          {index > 0 ? (
            <button type="button" className="tim-btn" disabled={busy} onClick={() => void go(index - 1)}>
              ← Retour
            </button>
          ) : (
            <span />
          )}
          {step !== "verifier" ? (
            <button type="button" className="tim-btn tim-btn--primary" disabled={busy || !loaded} onClick={() => void go(index + 1)}>
              {busy ? "Enregistrement…" : "Suivant →"}
            </button>
          ) : (
            <div className="ads-wiz__final">
              <button type="button" className="tim-btn" disabled={busy} onClick={() => void finish(false)}>
                Créer sans lancer
              </button>
              <button type="button" className="tim-btn tim-btn--primary" disabled={!canLaunch} onClick={() => void finish(true)} title={preview && !preview.lancable ? preview.blocages.join(" ") : undefined}>
                {busy ? "…" : "Créer et lancer l'agent"}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <label className="ads-wiz__field">
      <span className="ads-wiz__label">
        {label}
        {required ? <span className="ads-wiz__req"> *</span> : null}
      </span>
      {children}
      {help ? <small className="ads-wiz__help">{help}</small> : null}
    </label>
  );
}

function Recap({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="ads-wiz__recap-item">
      <dt>
        {title}
        <button type="button" onClick={onEdit}>
          Modifier
        </button>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
