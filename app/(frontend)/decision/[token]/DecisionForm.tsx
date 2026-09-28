"use client";

import { useEffect, useRef, useState } from "react";

import { burstAt } from "@/core/ui/confetti";
import {
  CLIENT_DECISIONS,
  EXTENSION_REQUESTS,
  LOST_REASONS,
  clientDecisionLabel,
} from "@/modules/marketing/lib/journey";

/**
 * Les trois réponses, à confirmer — puis une seconde étape propre à chacune.
 *
 * Le bouton cliqué dans l'e-mail arrive présélectionné — il ne reste qu'à
 * valider. Les deux autres restent visibles et cliquables : on se trompe de
 * bouton sur un téléphone, et surtout on peut changer d'avis entre le message
 * et la page.
 *
 * Chaque réponse porte sa CONSÉQUENCE sous son libellé. « Je m'arrête » sans
 * rien de plus se choisit à l'aveugle ; « dites-nous ce qui a manqué » explique
 * pourquoi on la propose aussi franchement que les deux autres.
 *
 * Une fois la réponse enregistrée, la page ne se contente pas d'un « merci » :
 *   - « Je continue »   → la suite, étape par étape (et quelques confettis) ;
 *   - « Plus de temps » → combien, et ce qui aiderait à trancher ;
 *   - « Je m'arrête »   → ce qui a manqué, en cases à cocher d'abord.
 * Les deux dernières sont facultatives : la décision, elle, est déjà prise en
 * compte — on le dit, pour que personne ne se sente retenu par un formulaire.
 */
export default function DecisionForm({
  token,
  suggested,
  current,
}: {
  token: string;
  suggested: string | null;
  current: string | null;
}) {
  const [choice, setChoice] = useState<string | null>(suggested ?? current);
  const [saved, setSaved] = useState<string | null>(current);
  // Revenir sur la page sans nouveau choix mène droit à la suite de sa réponse.
  const [view, setView] = useState<"choix" | "suite">(
    current && (!suggested || suggested === current) ? "suite" : "choix",
  );
  // Les confettis saluent le geste, pas une simple visite de la page.
  const [justSaved, setJustSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!choice) return;
    // Même réponse qu'enregistrée : rien à réécrire, on revient à sa suite.
    if (choice === saved) {
      setView("suite");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, decision: choice }),
      });
      if (!res.ok) throw new Error();
      setSaved(choice);
      setJustSaved(true);
      setView("suite");
    } catch {
      setError("L'enregistrement a échoué. Répondez à notre e-mail, on lit tout.");
    } finally {
      setBusy(false);
    }
  };

  if (view === "suite" && saved) {
    const back = () => {
      setChoice(saved);
      setJustSaved(false);
      setView("choix");
    };
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        {saved === "contrat" && <NextSteps celebrate={justSaved} />}
        {saved === "prolongation" && <MoreTime token={token} />}
        {saved === "abandon" && <WhatWasMissing token={token} />}
        <button
          type="button"
          onClick={back}
          className="mt-10 text-sm text-muted underline-offset-2 transition hover:text-foreground hover:underline"
        >
          Changer ma réponse
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-bold text-foreground">Votre décision</h1>
      <p className="mt-2 text-sm text-muted">
        {saved
          ? `Votre réponse actuelle : « ${clientDecisionLabel(saved)} ». Vous pouvez la changer ici.`
          : "Votre phase de test se termine. Trois réponses possibles, et la troisième compte autant que les deux autres."}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {CLIENT_DECISIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => setChoice(d.value)}
            aria-pressed={choice === d.value}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              choice === d.value
                ? "border-primary bg-primary-light"
                : "border-border hover:bg-surface"
            }`}
          >
            <span className="block font-semibold text-foreground">{d.label}</span>
            <span className="mt-0.5 block text-sm text-muted">{d.hint}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={busy || !choice}
        onClick={() => void confirm()}
        className="mt-6 rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
      >
        {busy ? "Envoi…" : "Confirmer ma réponse"}
      </button>

      {error && (
        <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground">{error}</p>
      )}
    </main>
  );
}

// ─── « Je continue » ─────────────────────────────────────────────────────────

/**
 * Les étapes qui suivent un oui, dans l'ordre du parcours (bloc « Sortie de
 * test » de journey.ts). Sans délai chiffré : le devis part quand TIM l'a
 * rédigé, et une date promise ici qu'on ne tient pas coûterait plus cher que
 * l'absence de date.
 */
const NEXT_STEPS = [
  {
    title: "Votre devis",
    text: "Préparé par TIM à partir de votre dossier de démarrage, il vous est transmis par votre partenaire.",
  },
  {
    title: "Votre contrat",
    text: "Rédigé une fois le devis validé : mode de paiement, conditions, tout y est.",
  },
  {
    title: "La signature",
    text: "Vous signez le contrat ; il est enregistré sur votre dossier.",
  },
  {
    title: "Le passage en production",
    text: "Vos licences définitives sont activées, et c'est parti.",
  },
];

function NextSteps({ celebrate }: { celebrate: boolean }) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!celebrate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = titleRef.current?.getBoundingClientRect();
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 3;
    const w = window.innerWidth;
    // Trois salves décalées : une seule fait « clic validé », trois font fête.
    burstAt(w / 2, y, 90);
    const t1 = window.setTimeout(() => burstAt(w * 0.25, y + 40, 60), 180);
    const t2 = window.setTimeout(() => burstAt(w * 0.75, y + 40, 60), 320);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [celebrate]);

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Je continue</p>
      <h1 ref={titleRef} className="mt-2 text-2xl font-bold text-foreground">
        Bienvenue dans l&apos;aventure&nbsp;!
      </h1>
      <p className="mt-2 text-sm text-muted">
        Votre réponse est arrivée chez la personne qui suit votre test. Voici ce qui se passe
        maintenant — vous n&apos;avez rien à faire d&apos;ici là.
      </p>

      <ol className="mt-8 flex flex-col gap-5">
        {NEXT_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary"
            >
              {i + 1}
            </span>
            <div>
              <p className="font-semibold text-foreground">{s.title}</p>
              <p className="mt-0.5 text-sm text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 rounded-xl bg-surface px-4 py-3 text-sm text-foreground">
        Chaque document vous arrive par e-mail. Une question d&apos;ici là&nbsp;? Répondez
        simplement à notre message.
      </p>
    </>
  );
}

// ─── « J'ai besoin de plus de temps » ────────────────────────────────────────

function MoreTime({ token }: { token: string }) {
  const [days, setDays] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const { state, send, error } = useDetailsSender(token);

  if (state === "sent") {
    return (
      <Done
        kicker="J'ai besoin de plus de temps"
        title="Demande envoyée."
        text="Votre partenaire revient vers vous pour confirmer la nouvelle date de fin. Rien à réinstaller : vous reprenez là où vous en étiez."
      />
    );
  }

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">
        J&apos;ai besoin de plus de temps
      </p>
      <h1 className="mt-2 text-2xl font-bold text-foreground">
        De combien de temps avez-vous besoin&nbsp;?
      </h1>
      <p className="mt-2 text-sm text-muted">
        Votre réponse est bien prise en compte. Dites-nous la durée, on s&apos;organise.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3" role="radiogroup" aria-label="Durée souhaitée">
        {EXTENSION_REQUESTS.map((e) => (
          <button
            key={e.value}
            type="button"
            role="radio"
            aria-checked={days === e.value}
            onClick={() => setDays(e.value)}
            className={`rounded-xl border px-3 py-4 text-center font-semibold text-foreground transition ${
              days === e.value ? "border-primary bg-primary-light" : "border-border hover:bg-surface"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <label className="mt-6 block">
        <span className="text-sm font-semibold text-foreground">
          Qu&apos;est-ce qui vous aiderait à trancher&nbsp;?{" "}
          <span className="font-normal text-muted">(facultatif)</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Tester la facturation avec l'équipe, un point avec votre partenaire…"
          className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
        />
      </label>

      <SubmitRow
        label="Envoyer ma demande"
        disabled={!days}
        busy={state === "busy"}
        onClick={() => void send({ days, note })}
        error={error}
      />
    </>
  );
}

// ─── « Je m'arrête » ─────────────────────────────────────────────────────────

function WhatWasMissing({ token }: { token: string }) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [skipped, setSkipped] = useState(false);
  const { state, send, error } = useDetailsSender(token);

  const toggle = (value: string) =>
    setReasons((r) => (r.includes(value) ? r.filter((v) => v !== value) : [...r, value]));

  if (state === "sent" || skipped) {
    return (
      <Done
        kicker="Je m'arrête"
        title={skipped ? "C'est noté." : "Merci, c'est précieux."}
        text={
          skipped
            ? "Votre réponse est arrivée chez la personne qui suit votre test. Si l'envie vous prend d'en dire plus, répondez simplement à notre e-mail."
            : "Votre retour est arrivé chez la personne qui suit votre test ; il nous sert directement à améliorer TIM. Et si les choses changent, notre porte reste ouverte."
        }
      />
    );
  }

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">Je m&apos;arrête</p>
      <h1 className="mt-2 text-2xl font-bold text-foreground">Merci de votre franchise.</h1>
      <p className="mt-2 text-sm text-muted">
        Votre réponse est prise en compte. Pour qu&apos;elle nous serve vraiment&nbsp;: qu&apos;est-ce
        qui a manqué&nbsp;? Plusieurs réponses possibles.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {LOST_REASONS.map((r) => {
          const on = reasons.includes(r.value);
          return (
            <button
              key={r.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(r.value)}
              className={`rounded-full border px-3.5 py-2 text-sm text-foreground transition ${
                on ? "border-primary bg-primary-light font-semibold" : "border-border hover:bg-surface"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <label className="mt-6 block">
        <span className="text-sm font-semibold text-foreground">
          Qu&apos;est-ce qui aurait fait la différence&nbsp;?{" "}
          <span className="font-normal text-muted">(facultatif)</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Une fonctionnalité, un accompagnement, un prix…"
          className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
        />
      </label>

      <SubmitRow
        label="Envoyer mon retour"
        disabled={!reasons.length && !note.trim()}
        busy={state === "busy"}
        onClick={() => void send({ reasons, note })}
        error={error}
        secondary={{ label: "Je préfère ne pas détailler", onClick: () => setSkipped(true) }}
      />
    </>
  );
}

// ─── Briques communes ────────────────────────────────────────────────────────

function useDetailsSender(token: string) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async (details: { days?: number | null; reasons?: string[]; note?: string }) => {
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/decision/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...details }),
      });
      if (!res.ok) throw new Error();
      setState("sent");
    } catch {
      setState("idle");
      setError(
        "L'envoi a échoué. Votre décision, elle, est bien enregistrée — répondez à notre e-mail pour le reste.",
      );
    }
  };

  return { state, send, error };
}

function SubmitRow({
  label,
  disabled,
  busy,
  onClick,
  error,
  secondary,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
  error: string | null;
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={onClick}
          className="rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {busy ? "Envoi…" : label}
        </button>
        {secondary && (
          <button
            type="button"
            onClick={secondary.onClick}
            className="text-sm text-muted transition hover:text-foreground"
          >
            {secondary.label}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-foreground">{error}</p>
      )}
    </>
  );
}

function Done({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{kicker}</p>
      <div className="mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success-text">
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="mt-4 text-2xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </>
  );
}
