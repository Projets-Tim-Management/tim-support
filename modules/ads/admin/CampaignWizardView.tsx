import { AI_SHARE_MAX_PCT } from "@/modules/ads/agent/limits";
import { stepProblems, WIZARD_STEPS, type StepKey, type WizardDraft } from "@/modules/ads/lib/campaign-wizard";
import { CTA_OPTIONS } from "@/modules/ads/lib/cta";
import { TONES } from "@/modules/ads/lib/dimensions";

/**
 * La fenêtre « Nouvelle campagne », telle qu'elle s'affiche — sans chargement ni
 * appel : CampaignWizard tient l'état et les enregistrements, ce fichier dessine.
 * Séparé pour être rendu et vérifié hors de l'admin.
 *
 * Deux colonnes : les étapes à gauche (où l'on en est, ce qui est fait), l'étape
 * en cours à droite, avec ce qu'elle demande et pourquoi.
 */

export type Option = { id: number | string; label: string };
export type AgentPreview = { lancable: boolean; blocages: string[]; budget: { coutMaximalEur: number } };

export type WizardViewProps = {
  resuming: boolean;
  d: WizardDraft;
  set: <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => void;
  step: StepKey;
  loaded: boolean;
  busy: boolean;
  tried: boolean;
  accounts: Option[];
  facts: Option[];
  preview: AgentPreview | null;
  runObjective: string;
  setRunObjective: (v: string) => void;
  capEur: string;
  setCapEur: (v: string) => void;
  onGo: (index: number) => void;
  onEdit: (step: StepKey) => void;
  onFinish: (launch: boolean) => void;
  onClose: () => void;
};

const OBJECTIVE_CARDS = [
  { value: "leads", label: "Des prospects", help: "Des demandes de démo ou d'essai.", icon: "users" },
  { value: "trafic", label: "Du trafic", help: "Des visites qualifiées sur le site.", icon: "cursor" },
  { value: "notoriete", label: "De la notoriété", help: "Faire connaître TIM au plus grand nombre.", icon: "megaphone" },
] as const;

const AUTONOMY_CARDS = [
  { value: "observer", label: "Observer", help: "Il analyse et rapporte, il n'agit pas.", icon: "eye" },
  { value: "proposer", label: "Proposer", help: "Chaque action passe par « À valider ».", icon: "hand" },
  { value: "autonome", label: "Autonome", help: "Il agit seul, dans les garde-fous.", icon: "bolt" },
] as const;

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const num = (v: string): number | null => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const labelOf = (list: readonly { label: string; value: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v;

export function CampaignWizardView(p: WizardViewProps) {
  const { d, step } = p;
  const index = WIZARD_STEPS.findIndex((s) => s.key === step);
  const meta = WIZARD_STEPS[index];
  const problems = stepProblems(step, d);
  const okAt = (i: number) => WIZARD_STEPS[i].key === "verifier" || stepProblems(WIZARD_STEPS[i].key, d).length === 0;
  // Une étape déjà franchie se rouvre d'un clic ; on ne saute pas une étape incomplète.
  const reachable = (i: number) => i <= index || WIZARD_STEPS.slice(0, i).every((_, j) => okAt(j));
  const canLaunch = Boolean(p.preview?.lancable && p.runObjective.trim() && Number(p.capEur) > 0 && !p.busy);

  return (
    <div className="ads-wiz" role="dialog" aria-modal="true" aria-labelledby="ads-wiz-title">
      <div className="ads-wiz__panel">
        <aside className="ads-wiz__aside">
          <div className="ads-wiz__brand">
            <span className="ads-wiz__brand-icon" aria-hidden>
              <Icon name="flag" />
            </span>
            <div>
              <strong>{p.resuming ? "Compléter la campagne" : "Nouvelle campagne"}</strong>
              <span>{p.d.name.trim() || "Sans nom pour l'instant"}</span>
            </div>
          </div>
          <ol className="ads-wiz__steps">
            {WIZARD_STEPS.map((s, i) => {
              const state = i === index ? "on" : i < index || (okAt(i) && s.key !== "verifier") ? "done" : "todo";
              return (
                <li key={s.key} className={`ads-wiz__step ads-wiz__step--${state}`}>
                  <button type="button" disabled={p.busy || !reachable(i) || i === index} onClick={() => p.onGo(i)}>
                    <span className="ads-wiz__dot" aria-hidden>
                      {state === "done" ? <Icon name="check" /> : <Icon name={STEP_ICON[s.key]} />}
                    </span>
                    <span className="ads-wiz__step-text">
                      <span className="ads-wiz__step-label">{s.label}</span>
                      <span className="ads-wiz__step-sub">{state === "done" ? "Fait" : state === "on" ? "En cours" : `Étape ${i + 1}`}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="ads-wiz__saved">
            <Icon name="cloud" /> Chaque étape est enregistrée : vous pouvez fermer et reprendre plus tard.
          </p>
        </aside>

        <div className="ads-wiz__main">
          <header className="ads-wiz__head">
            <div>
              <span className="ads-wiz__eyebrow">
                Étape {index + 1} sur {WIZARD_STEPS.length}
              </span>
              <h2 id="ads-wiz-title">{meta.title}</h2>
              <p className="ads-wiz__intro">{meta.intro}</p>
            </div>
            <button type="button" className="ads-wiz__close" onClick={p.onClose} aria-label="Fermer" title="Fermer : les étapes déjà passées sont enregistrées">
              <Icon name="close" />
            </button>
          </header>
          <div className="ads-wiz__progress" aria-hidden>
            <span style={{ width: `${Math.round(((index + 1) / WIZARD_STEPS.length) * 100)}%` }} />
          </div>

          <div className="ads-wiz__body">
            {!p.loaded ? <p className="ads-wiz__muted">Chargement…</p> : <StepBody {...p} />}
            {p.tried && problems.length > 0 && (
              <div className="ads-wiz__problems" role="alert">
                <Icon name="alert" />
                <ul>
                  {problems.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <footer className="ads-wiz__foot">
            {index > 0 ? (
              <button type="button" className="tim-btn ads-wiz__back" disabled={p.busy} onClick={() => p.onGo(index - 1)}>
                ← Retour
              </button>
            ) : (
              <span />
            )}
            {step !== "verifier" ? (
              <button type="button" className="tim-btn tim-btn--primary ads-wiz__next" disabled={p.busy || !p.loaded} onClick={() => p.onGo(index + 1)}>
                {p.busy ? "Enregistrement…" : `Suivant : ${WIZARD_STEPS[index + 1].label} →`}
              </button>
            ) : (
              <div className="ads-wiz__final">
                <button type="button" className="tim-btn" disabled={p.busy} onClick={() => p.onFinish(false)}>
                  Créer sans lancer
                </button>
                <button type="button" className="tim-btn tim-btn--primary ads-wiz__next" disabled={!canLaunch} onClick={() => p.onFinish(true)} title={p.preview && !p.preview.lancable ? p.preview.blocages.join(" ") : undefined}>
                  {p.busy ? "…" : "Créer et lancer l'agent"}
                </button>
              </div>
            )}
          </footer>
        </div>
      </div>
    </div>
  );
}

function StepBody(p: WizardViewProps) {
  const { d, set, step } = p;
  if (step === "bases")
    return (
      <>
        <Field label="Nom de la campagne" required>
          <input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Pointage mobile — gérants PME BTP" autoFocus />
        </Field>
        <Field label="Compte publicitaire" required help={p.accounts.length === 1 ? "Le seul compte connecté, choisi d'office." : undefined}>
          <select value={d.account == null ? "" : String(d.account)} onChange={(e) => set("account", e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choisir…</option>
            {p.accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ce que la campagne doit obtenir" required>
          <Cards name="objective" value={d.objective} cards={OBJECTIVE_CARDS} onChange={(v) => set("objective", v)} />
        </Field>
      </>
    );
  if (step === "cible")
    return (
      <>
        <Field label="Cible" required help="Qui ils sont, leur métier, la taille de l'entreprise, la zone.">
          <textarea rows={3} value={d.audience} onChange={(e) => set("audience", e.target.value)} placeholder="Conducteurs de travaux et gérants de PME du BTP, 11 à 100 salariés, France" autoFocus />
        </Field>
        <Field label="Leur problème, dans leurs mots" required help="Une phrase qu'ils pourraient dire eux-mêmes.">
          <textarea rows={3} value={d.pain} onChange={(e) => set("pain", e.target.value)} placeholder="« Le pointage papier me coûte 2 h par semaine »" />
        </Field>
      </>
    );
  if (step === "offre")
    return (
      <>
        <div className="ads-wiz__row">
          <Field label="L'offre" required help="Les chiffres écrits ici (durées, prix) sont autorisés dans les textes.">
            <textarea rows={3} value={d.offer} onChange={(e) => set("offer", e.target.value)} placeholder="Démo de 30 minutes, sans engagement" autoFocus />
          </Field>
          <Field label="La promesse" required help="Ce qui change après — vérifiable.">
            <textarea rows={3} value={d.promise} onChange={(e) => set("promise", e.target.value)} placeholder="Les heures arrivent justes sur la paie, sans ressaisie" />
          </Field>
        </div>
        <Field label="Preuves chiffrées autorisées" help={p.facts.length ? `${d.proofs.length} sélectionnée(s). Les seuls chiffres que les textes pourront citer, avec l'offre.` : "Aucun fait sourcé actif : ajoutez-en dans Ressources › Faits sourcés."}>
          {p.facts.length > 0 && (
            <div className="ads-wiz__checks">
              {p.facts.map((f) => {
                const on = d.proofs.map(String).includes(String(f.id));
                return (
                  <label key={f.id} className={`ads-wiz__check${on ? " ads-wiz__check--on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={(e) => set("proofs", e.target.checked ? [...d.proofs, f.id] : d.proofs.filter((x) => String(x) !== String(f.id)))} />
                    <span>{f.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </Field>
      </>
    );
  if (step === "pub")
    return (
      <>
        <Field label="Page d'arrivée" required help="Où mène le clic. Une adresse complète en https://.">
          <div className="ads-wiz__url">
            <Icon name="link" />
            <input value={d.landingUrl} onChange={(e) => set("landingUrl", e.target.value)} placeholder="https://tim-management.co/…" autoFocus />
          </div>
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
        <div className="ads-wiz__row">
          <Field label="Angles souhaités" optional help="Un par ligne. Vide, l'agent en propose trois.">
            <textarea rows={3} value={d.angles.join("\n")} onChange={(e) => set("angles", e.target.value.split("\n"))} placeholder={"La fin de la ressaisie du vendredi\nDes heures justes pour une paie juste"} />
          </Field>
          <Field label="Interdits de cette campagne" optional help="Un par ligne. S'ajoutent à ceux du kit de marque.">
            <textarea rows={3} value={d.forbidden} onChange={(e) => set("forbidden", e.target.value)} />
          </Field>
        </div>
      </>
    );
  if (step === "budget")
    return (
      <>
        <div className="ads-wiz__row ads-wiz__row--3">
          <Field label="Budget par jour" required help="IA et Meta ensemble.">
            <Money value={d.totalDailyEur} onChange={(v) => set("totalDailyEur", v)} placeholder="10" autoFocus />
          </Field>
          <Field label="Plancher Meta" help="Par jour, jamais en dessous.">
            <Money value={d.metaFloorEur} onChange={(v) => set("metaFloorEur", v)} />
          </Field>
          <Field label="Part IA maximale" help={`De 0 à ${AI_SHARE_MAX_PCT} %.`}>
            <div className="ads-wiz__unit">
              <input type="number" min="0" max={AI_SHARE_MAX_PCT} step="1" value={d.maxAiSharePct ?? ""} onChange={(e) => set("maxAiSharePct", num(e.target.value))} />
              <span>%</span>
            </div>
          </Field>
        </div>
        {d.totalDailyEur != null && d.totalDailyEur > 0 && (
          <p className="ads-wiz__note">
            <Icon name="info" />
            <span>
              Soit au plus <strong>{eur(d.totalDailyEur * 30)}</strong> sur 30 jours. L&apos;agent propose la répartition entre l&apos;IA et Meta ; rien n&apos;est dépensé chez Meta avant l&apos;activation.
            </span>
          </p>
        )}
        <Field label="Liberté de l'agent une fois en ligne" help="Quel que soit le choix : une hausse de plus de 20 % ou une réactivation se valident à la main.">
          <Cards name="autonomy" value={d.autonomy} cards={AUTONOMY_CARDS} onChange={(v) => set("autonomy", v)} />
        </Field>
      </>
    );
  const account = p.accounts.find((a) => String(a.id) === String(d.account))?.label ?? "—";
  const angles = d.angles.filter((a) => a.trim()).length;
  return (
    <>
      <div className="ads-wiz__recap">
        <Recap icon="flag" title="La campagne" onEdit={() => p.onEdit("bases")}>
          <strong>{d.name}</strong>
          <span>
            {account} · {labelOf(OBJECTIVE_CARDS, d.objective)}
          </span>
        </Recap>
        <Recap icon="users" title="Cible" onEdit={() => p.onEdit("cible")}>
          <span>{d.audience}</span>
          <em>{d.pain}</em>
        </Recap>
        <Recap icon="gift" title="Offre" onEdit={() => p.onEdit("offre")}>
          <span>{d.offer}</span>
          <em>
            {d.promise} · {d.proofs.length ? `${d.proofs.length} preuve(s)` : "aucune preuve chiffrée"}
          </em>
        </Recap>
        <Recap icon="link" title="Pub" onEdit={() => p.onEdit("pub")}>
          <span className="ads-wiz__ellipsis">{d.landingUrl}</span>
          <em>
            {labelOf(CTA_OPTIONS, d.cta)} · {labelOf(TONES, d.tone)}
            {angles ? ` · ${angles} angle(s)` : ""}
          </em>
        </Recap>
        <Recap icon="coins" title="Budget" onEdit={() => p.onEdit("budget")}>
          <strong>{d.totalDailyEur != null ? `${eur(d.totalDailyEur)} par jour` : "—"}</strong>
          <em>
            Plancher Meta {d.metaFloorEur != null ? eur(d.metaFloorEur) : "—"} · {labelOf(AUTONOMY_CARDS, d.autonomy)}
          </em>
        </Recap>
      </div>
      <section className="ads-wiz__launch">
        <div className="ads-wiz__launch-head">
          <span className="ads-wiz__launch-icon" aria-hidden>
            <Icon name="sparkles" />
          </span>
          <div>
            <strong>Premier passage de l&apos;agent</strong>
            <span>Il prépare le positionnement, les textes et les briefs Claude Design, puis dépose les créas dans « À valider ». Rien n&apos;est publié chez Meta.</span>
          </div>
        </div>
        <div className="ads-wiz__row">
          <Field label="Objectif de ce passage, en une phrase">
            <textarea rows={2} value={p.runObjective} onChange={(e) => p.setRunObjective(e.target.value)} />
          </Field>
          <Field label="Plafond du passage" help={p.preview ? `Coût maximal : ${eur(p.preview.budget.coutMaximalEur)}.` : undefined}>
            <Money value={num(p.capEur)} onChange={(v) => p.setCapEur(v == null ? "" : String(v))} step="0.5" />
          </Field>
        </div>
        {p.preview && p.preview.blocages.length > 0 && (
          <div className="ads-wiz__problems">
            <Icon name="alert" />
            <ul>
              {p.preview.blocages.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}

function Field({ label, required, optional, help, children }: { label: string; required?: boolean; optional?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div className="ads-wiz__field">
      <span className="ads-wiz__label">
        {label}
        {required ? <span className="ads-wiz__req"> *</span> : null}
        {optional ? <span className="ads-wiz__opt">facultatif</span> : null}
      </span>
      {children}
      {help ? <small className="ads-wiz__help">{help}</small> : null}
    </div>
  );
}

function Money({ value, onChange, placeholder, autoFocus, step = "1" }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; autoFocus?: boolean; step?: string }) {
  return (
    <div className="ads-wiz__unit">
      <input type="number" min="0" step={step} value={value ?? ""} onChange={(e) => onChange(num(e.target.value))} placeholder={placeholder} autoFocus={autoFocus} />
      <span>€</span>
    </div>
  );
}

function Cards({ name, value, cards, onChange }: { name: string; value: string; cards: readonly { value: string; label: string; help: string; icon: IconName }[]; onChange: (v: string) => void }) {
  return (
    <div className="ads-wiz__cards" role="radiogroup">
      {cards.map((c) => (
        <label key={c.value} className={`ads-wiz__card${value === c.value ? " ads-wiz__card--on" : ""}`}>
          <input type="radio" name={name} checked={value === c.value} onChange={() => onChange(c.value)} />
          <span className="ads-wiz__card-icon" aria-hidden>
            <Icon name={c.icon} />
          </span>
          <strong>{c.label}</strong>
          <span>{c.help}</span>
        </label>
      ))}
    </div>
  );
}

function Recap({ icon, title, onEdit, children }: { icon: IconName; title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="ads-wiz__recap-item">
      <span className="ads-wiz__recap-icon" aria-hidden>
        <Icon name={icon} />
      </span>
      <div className="ads-wiz__recap-text">
        <span className="ads-wiz__recap-title">{title}</span>
        {children}
      </div>
      <button type="button" onClick={onEdit}>
        Modifier
      </button>
    </div>
  );
}

/* ── Icônes au trait, dans la couleur du texte ─────────────────────────────── */

type IconName = "flag" | "users" | "gift" | "link" | "coins" | "check" | "close" | "cloud" | "alert" | "info" | "sparkles" | "cursor" | "megaphone" | "eye" | "hand" | "bolt";

const STEP_ICON: Record<StepKey, IconName> = { bases: "flag", cible: "users", offre: "gift", pub: "link", budget: "coins", verifier: "check" };

const PATHS: Record<IconName, React.ReactNode> = {
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.8 3 2.6 3.5 5.2" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.5 9 8 12 8zM12 8s1.5-4.5 4-3.5S15 8 12 8z" />
    </>
  ),
  link: <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />,
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
      <path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7M3.5 11v4c0 1.4 2.5 2.5 5.5 2.5 1 0 2-.1 2.8-.4" />
      <ellipse cx="16" cy="15" rx="4.5" ry="2" />
      <path d="M11.5 15v3c0 1.1 2 2 4.5 2s4.5-.9 4.5-2v-3" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  cloud: (
    <>
      <path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 9.5 4.3 4.3 0 0 0 7 18z" />
      <path d="M9.5 13.5l2 2 3.5-3.5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.5" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>
  ),
  cursor: <path d="M5 3l14 7-6 2-2 6z" />,
  megaphone: <path d="M4 10v4h3l7 4V6L7 10zM17.5 9a4 4 0 0 1 0 6M7 14l1.5 5h2.5L10 15" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  hand: <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7 6 6 0 0 1-5-2.7L3 15a1.5 1.5 0 0 1 2.4-1.8L8 15" />,
  bolt: <path d="M13 2.5L4.5 13.5H12L11 21.5l8.5-11H12z" />,
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
