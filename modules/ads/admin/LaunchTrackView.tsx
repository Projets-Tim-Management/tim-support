import type { LaunchStep } from "@/modules/ads/lib/launch-track";

/** Le parcours tel qu'il s'affiche, sans chargement : rendu aussi hors de l'admin (aperçus). */
export function LaunchTrackView({ steps, onAct }: { steps: LaunchStep[]; onAct: (s: LaunchStep) => void }) {
  const currentIndex = steps.findIndex((s) => s.current);
  const current = currentIndex >= 0 ? steps[currentIndex] : null;
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <section className={`ads-track${current ? "" : " ads-track--live"}`} aria-label="Lancement de la campagne">
      <header className="ads-track__head">
        <div>
          <span className="ads-track__eyebrow">Lancement de la campagne</span>
          <strong className="ads-track__count">{current ? `${doneCount} étape${doneCount > 1 ? "s" : ""} sur ${steps.length}` : "En diffusion"}</strong>
        </div>
        <div className="ads-track__progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement">
          <span style={{ width: `${pct}%` }} />
        </div>
      </header>

      <ol className="ads-track__steps">
        {steps.map((s, i) => {
          const state = s.done ? "done" : s.current ? "current" : "todo";
          return (
            <li key={s.key} className={`ads-track__step ads-track__step--${state}`}>
              <span className="ads-track__icon" aria-hidden>
                {s.done ? <Check /> : <StepIcon k={s.key} />}
              </span>
              <span className="ads-track__label">{s.label}</span>
              <span className="ads-track__state">{s.done ? "Fait" : s.current ? "En cours" : `Étape ${i + 1}`}</span>
            </li>
          );
        })}
      </ol>

      {current ? (
        <div className="ads-track__next">
          <div className="ads-track__next-icon" aria-hidden>
            <StepIcon k={current.key} />
          </div>
          <div className="ads-track__next-text">
            <span className="ads-track__next-step">
              Étape {currentIndex + 1} sur {steps.length}
              {current.detail ? <em className="ads-track__detail">{current.detail}</em> : null}
            </span>
            <strong>{current.label}</strong>
            <p>{current.hint}</p>
          </div>
          {current.action && (
            <button type="button" className="tim-btn tim-btn--primary ads-track__cta" onClick={() => onAct(current)}>
              {current.actionLabel} →
            </button>
          )}
        </div>
      ) : (
        <div className="ads-track__next ads-track__next--live">
          <div className="ads-track__next-icon" aria-hidden>
            <Check />
          </div>
          <div className="ads-track__next-text">
            <strong>La campagne est en diffusion</strong>
            <p>Suivez ses chiffres dans l&apos;onglet « Résultats ». « Mettre en pause », dans l&apos;onglet « Diffusion », l&apos;arrête à tout moment.</p>
          </div>
        </div>
      )}
    </section>
  );
}

const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Check() {
  return (
    <svg {...svg}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Une icône par étape, au trait, dans la couleur du texte. */
function StepIcon({ k }: { k: LaunchStep["key"] }) {
  if (k === "brief")
    return (
      <svg {...svg}>
        <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
        <path d="M14 3v5h5M8.5 13h7M8.5 17h5" />
      </svg>
    );
  if (k === "agent")
    return (
      <svg {...svg}>
        <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
        <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
      </svg>
    );
  if (k === "creas")
    return (
      <svg {...svg}>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M3.5 15.5l4.5-4.5 4 4 3-3 5.5 5.5" />
        <circle cx="15.5" cy="9" r="1.5" />
      </svg>
    );
  if (k === "publier")
    return (
      <svg {...svg}>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
      </svg>
    );
  if (k === "apercus")
    return (
      <svg {...svg}>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  return (
    <svg {...svg}>
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}

