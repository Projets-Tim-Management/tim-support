"use client";

import { useAuth } from "@payloadcms/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { AssistantData, AssistantItem } from "./data-assistant";

/**
 * L'assistant : une bulle fixée en bas à droite, un fil de messages quand on
 * l'ouvre. Pas d'intelligence — il lit ce que le support sait déjà et le dit
 * en phrases, chacune avec un bouton qui mène au geste. Le style d'une
 * conversation, parce que c'est ainsi qu'on lit « ce qu'il me reste à faire »
 * sans avoir à chercher dans quatre écrans.
 *
 * Rechargé à chaque changement de page et toutes les cinq minutes ; la bulle
 * porte le nombre de sujets. Ouvert ou fermé, c'est retenu sur ce navigateur.
 */
const REFRESH_MS = 5 * 60_000;
const OPEN_KEY = "tim-assistant-open";

const salutation = (prenom: string | null) => {
  const heure = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).find((p) => p.type === "hour")?.value ?? "12");
  return `${heure < 18 ? "Bonjour" : "Bonsoir"}${prenom ? ` ${prenom}` : ""} 👋`;
};

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function Message({ item }: { item: AssistantItem }) {
  return (
    <li className={`ta-msg ta-msg--${item.tone}`}>
      <p className="ta-msg__text">{item.text}</p>
      {item.hint && <p className="ta-msg__hint">{item.hint}</p>}
      <Link className="ta-msg__cta" href={item.cta.href} prefetch={false}>
        {item.cta.label} ›
      </Link>
    </li>
  );
}

export default function AssistantWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [data, setData] = useState<AssistantData | null>(null);
  const [open, setOpen] = useState(false);

  // L'état ouvert/fermé, retenu sur ce navigateur — un assistant qui se
  // rouvre à chaque page finirait fermé pour de bon.
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === "1");
    } catch {
      /* stockage indisponible : fermé */
    }
  }, []);
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, o ? "0" : "1");
      } catch {
        /* rien */
      }
      return !o;
    });
  };

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () =>
      fetch("/api/admin/assistant", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: AssistantData | null) => {
          if (active && d) setData(d);
        })
        .catch(() => {});
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [user, pathname]);

  if (!user || !data) return null;
  const n = data.items.length;

  return (
    <div className={`ta${open ? " ta--open" : ""}`}>
      {open && (
        <section className="ta-panel" aria-label="Assistant">
          <header className="ta-head">
            <span className="ta-head__avatar" aria-hidden>
              T
            </span>
            <span className="ta-head__title">
              <span className="ta-head__name">Assistant TIM</span>
              <span className="ta-head__sub">{n ? `${n} sujet${n > 1 ? "s" : ""} à traiter` : "Rien ne presse"}</span>
            </span>
            <button type="button" className="ta-head__close" aria-label="Réduire" onClick={toggle}>
              ×
            </button>
          </header>

          <div className="ta-thread">
            <div className="ta-bubble">
              <p>{salutation(data.prenom)}</p>
              <p>
                {n === 0
                  ? "Rien n'attend votre action. Tout est à jour."
                  : `Voici ce qui vous attend${data.today ? `, et ${data.today} action${data.today > 1 ? "s" : ""} prévue${data.today > 1 ? "s" : ""} aujourd'hui` : ""}.`}
              </p>
            </div>
            {n > 0 && (
              <ul className="ta-list">
                {data.items.map((it) => (
                  <Message key={it.key} item={it} />
                ))}
              </ul>
            )}
            <p className="ta-time">Mis à jour à {heure(data.generatedAt)}</p>
          </div>
        </section>
      )}

      <button type="button" className="ta-fab" aria-label={open ? "Réduire l'assistant" : "Ouvrir l'assistant"} aria-expanded={open} onClick={toggle}>
        <span className="ta-fab__icon" aria-hidden>
          {open ? "×" : "💬"}
        </span>
        {!open && n > 0 && <span className="ta-fab__badge">{n}</span>}
      </button>
    </div>
  );
}
