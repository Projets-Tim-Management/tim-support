"use client";

import { RunNowButton } from "@/modules/ai-team/admin/RunNowButton";

/**
 * Lancer tout de suite le travail du bureau commercial (Nathan, Jade, Malo, Élise) ou la revue de la conversion (Lou) :
 * un bouton, une configuration par agent.
 */
type Conf = { url: string; icon: string; title: string; what: (name: string) => string; label: string; busy: (name: string) => string; done: (n: number) => string; failed: string };
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const TASKS = " pour Élise, qui trie chaque jour ; l'urgent est déjà dans « Mes tâches ».";

const CONF = {
  pipeline: { url: "/api/admin/ai-team/pipeline", icon: "🔁", title: "Pipeline & relances", what: (n) => `chaque lundi matin, ${n} lit les affaires en cours et les nouveaux leads, et propose au plus cinq relances à Élise, message prêt.`, label: "Faire le point maintenant", busy: (n) => `${n} lit le pipeline… (1 à 2 minutes)`, done: (k) => plural(k, "relance") + TASKS, failed: "Le point n'a pas pu être fait." },
  trials: { url: "/api/admin/ai-team/trials", icon: "⏳", title: "Essais", what: (n) => `chaque jour ouvré, ${n} lit les essais en cours — étapes, échanges, séance, bilan, date de décision — et propose au plus cinq gestes à Élise, message prêt.`, label: "Faire le point maintenant", busy: (n) => `${n} lit les essais… (1 à 2 minutes)`, done: (k) => plural(k, "geste") + TASKS, failed: "Le point n'a pas pu être fait." },
  health: { url: "/api/admin/ai-team/health", icon: "💚", title: "Santé des clients", what: (n) => `chaque lundi, ${n} note chaque client en place — vert, orange, rouge — sur des faits (mise en route, support, paiements, échanges) et propose au plus cinq gestes à Élise.`, label: "Faire le point maintenant", busy: (n) => `${n} lit vos clients… (1 à 2 minutes)`, done: (k) => plural(k, "geste") + TASKS, failed: "Le point n'a pas pu être fait." },
  comTriage: { url: "/api/admin/ai-team/com-triage", icon: "🗂️", title: "Tri du jour", what: (n) => `chaque jour ouvré, ${n} relit ce que Nathan, Jade et Malo proposent et ne vous remonte que l'essentiel (3 tâches au plus, 5 en attente au maximum).`, label: "Trier maintenant", busy: (n) => `${n} trie les propositions… (1 minute)`, done: () => "Le tri est dans la conversation ; les tâches gardées sont dans « Mes tâches ».", failed: "Le tri n'a pas pu être fait." },
  comWeekly: { url: "/api/admin/ai-team/com-weekly", icon: "📈", title: "Point commercial", what: (n) => `chaque lundi, ${n} part du MRR et de sa trajectoire, revoit les affaires qui peuvent signer, les essais qui se jouent et les clients à risque, et fait une prévision honnête.`, label: "Faire le point maintenant", busy: (n) => `${n} prépare le point… (2 à 4 minutes)`, done: () => "Le point est dans la conversation.", failed: "Le point n'a pas pu être fait." },
  conversion: { url: "/api/admin/ai-team/conversion", icon: "🎯", title: "Conversion", what: (n) => `chaque semaine, ${n} lit, page par page, combien de visites deviennent une démo, relit les pages qui vendent, et propose une ou deux hypothèses à fort effet.`, label: "Lancer maintenant", busy: (n) => `${n} lit vos pages… (1 à 3 minutes)`, done: (k) => `${plural(k, "hypothèse")} — Serge les reprendra dans vos objectifs.`, failed: "La revue n'a pas pu être faite." },
} satisfies Record<string, Conf>;

export function AgentRunButton({ kind, name }: { kind: keyof typeof CONF; name: string }) {
  const c: Conf = CONF[kind];
  return (
    <RunNowButton<{ findings?: number }>
      url={c.url}
      intro={
        <>
          {c.icon} <strong>{c.title}</strong> : {c.what(name)}
        </>
      }
      label={c.label}
      busyLabel={c.busy(name)}
      done={(d) => c.done(d.findings ?? 0)}
      failed={c.failed}
    />
  );
}
