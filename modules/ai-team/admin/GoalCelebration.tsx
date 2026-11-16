"use client";

import { useEffect, useRef, useState } from "react";

import type { Celebration } from "@/modules/ai-team/lib/celebrations";

/**
 * LE FEU D'ARTIFICE d'un objectif atteint (16/11/2026 : « je veux un feu d'artifice sur l'écran avec un popup pour
 * féliciter et motiver »). Posé dans la barre du haut, donc sur toutes les pages du back-office : à l'ouverture d'une
 * page, il demande s'il y a un objectif atteint pas encore fêté ; s'il y en a un, les fusées partent et la fenêtre
 * de félicitations s'ouvre. « Bravo l'équipe » le range (il ne revient plus) et passe au suivant s'il y en a.
 *
 * Réservé à la direction (le serveur rend une liste vide aux autres). Sans animation si le système le demande
 * (« réduire les animations ») : la fenêtre seule.
 */

const COLORS = ["#fe5464", "#fcc35b", "#1bc181", "#4a90e2", "#6b46c1", "#ff8fab", "#ffd166"];

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Rocket = { x: number; y: number; vy: number; burstAt: number; color: string };

/** Les fusées : elles montent du bas de l'écran et éclatent en gerbes, pendant quelques secondes. */
function Fireworks({ duration = 6500 }: { duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const rockets: Rocket[] = [];
    const sparks: Particle[] = [];
    const start = performance.now();
    let last = start;
    let nextLaunch = start;
    let frame = 0;
    const launch = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      rockets.push({ x: w * (0.15 + Math.random() * 0.7), y: h, vy: -(h * 0.011 + Math.random() * h * 0.004), burstAt: h * (0.15 + Math.random() * 0.35), color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    };
    const burst = (r: Rocket) => {
      const n = 70 + Math.floor(Math.random() * 40);
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
        const speed = 2 + Math.random() * 4.5;
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 1, color: Math.random() < 0.25 ? "#ffffff" : r.color, size: 1.6 + Math.random() * 1.8 });
      }
    };
    const tick = (t: number) => {
      const dt = Math.min(2, (t - last) / 16.7);
      last = t;
      const running = t - start < duration;
      if (running && t >= nextLaunch) {
        launch();
        if (Math.random() < 0.4) launch();
        nextLaunch = t + 280 + Math.random() * 380;
      }
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = "lighter";
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy * dt;
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (r.y <= r.burstAt) {
          burst(r);
          rockets.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.06 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= 0.012 * dt;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (running || rockets.length || sparks.length) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [duration]);
  return <canvas ref={ref} className="tim-fireworks" aria-hidden />;
}

const CHEERS = [
  "Ce chiffre, c'est le travail de toute l'équipe — les humains comme les agents. On garde ce rythme !",
  "Un objectif atteint, c'est une promesse tenue. Le prochain sera encore plus beau.",
  "Prenez une minute pour savourer : c'est mérité. Et ensuite, on vise plus haut.",
  "Voilà ce qui arrive quand on s'y tient semaine après semaine. Bravo !",
];

const fmt = (v: number | null, unit: string | null) =>
  v == null ? "—" : unit === "€" ? v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : unit === "%" ? `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const dayFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

export default function GoalCelebration() {
  const [queue, setQueue] = useState<Celebration[]>([]);
  const [busy, setBusy] = useState(false);
  const [calm, setCalm] = useState(false);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCalm(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    let alive = true;
    fetch("/api/admin/ai-team/celebrations", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { goals: [] }))
      .then((d: { goals?: Celebration[] }) => alive && setQueue(d.goals ?? []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const goal = queue[0];
  useEffect(() => {
    if (goal) close.current?.focus();
  }, [goal]);
  if (!goal) return null;

  const done = async () => {
    setBusy(true);
    await fetch("/api/admin/ai-team/celebrations", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: goal.id }) }).catch(() => undefined);
    setBusy(false);
    setQueue((q) => q.slice(1));
  };
  const cheer = CHEERS[Number(goal.id) % CHEERS.length];
  const gained = goal.value != null && goal.baseline != null ? goal.value - goal.baseline : null;

  return (
    <>
      {!calm && <Fireworks key={goal.id} />}
      <div className="tim-cheer" role="dialog" aria-modal="true" aria-labelledby="tim-cheer-title" onKeyDown={(e) => e.key === "Escape" && !busy && void done()}>
        <div className="tim-cheer__card">
          <div className="tim-cheer__trophy" aria-hidden>
            🏆
          </div>
          <p className="tim-cheer__kicker">Objectif atteint !</p>
          <h2 id="tim-cheer-title" className="tim-cheer__title">
            {goal.title}
          </h2>
          {goal.kind === "chiffre" && goal.value != null ? (
            <p className="tim-cheer__figure">
              <strong>{fmt(goal.value, goal.unit)}</strong>
              <span>
                {goal.indicator} · cible {fmt(goal.target, goal.unit)}
              </span>
            </p>
          ) : (
            goal.review && <p className="tim-cheer__proof">{goal.review}</p>
          )}
          <ul className="tim-cheer__facts">
            <li>📅 Atteint le {dayFr(goal.reachedAt)}{goal.daysEarly > 0 ? `, ${goal.daysEarly} jour${goal.daysEarly > 1 ? "s" : ""} avant l'échéance` : ""}</li>
            {gained != null && gained !== 0 && (
              <li>
                📈 {gained > 0 ? "+" : ""}
                {fmt(gained, goal.unit)} depuis le départ ({fmt(goal.baseline, goal.unit)})
              </li>
            )}
          </ul>
          <p className="tim-cheer__text">{cheer}</p>
          <p className="tim-cheer__next">
            ➡️ {goal.nextBy ?? "Vos chefs d'équipe"} vous proposer{goal.nextBy ? "a" : "ont"} le prochain objectif sur cet indicateur — revu à la hausse ou à la baisse, et pourquoi.
          </p>
          <button ref={close} type="button" className="tim-cheer__btn" onClick={() => void done()} disabled={busy}>
            Bravo l&apos;équipe ! 🚀
          </button>
          {queue.length > 1 && <p className="tim-cheer__more">Et ce n&apos;est pas tout : {queue.length - 1} autre{queue.length > 2 ? "s" : ""} objectif{queue.length > 2 ? "s" : ""} atteint{queue.length > 2 ? "s" : ""} !</p>}
        </div>
      </div>
    </>
  );
}
