"use client";

import Link from "next/link";
import { useRef, useState } from "react";

/**
 * Liste des étapes d'un parcours, réordonnable en glisser-déposer directement
 * depuis la vue liste. À chaque réorganisation, l'ordre est enregistré via
 * l'API REST Payload (PATCH /payload-api/parcours/:id → nouveau tableau `steps`).
 */

type Step = { id: number | string; title?: string };
type SaveStatus = "idle" | "saving" | "saved" | "error";

const FEATURE_URL = (id: number | string) => `/admin/collections/features/${id}`;

export function ParcoursCardSteps({
  parcoursId,
  steps: initial,
}: {
  parcoursId: number | string;
  steps: Step[];
}) {
  const [steps, setSteps] = useState<Step[]>(initial);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const dragIndex = useRef<number | null>(null);

  const save = async (next: Step[]) => {
    setStatus("saving");
    try {
      const res = await fetch(`/payload-api/parcours/${parcoursId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: next.map((s) => s.id) }),
      });
      if (res.ok) {
        setStatus("saved");
        window.setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1800);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const handleDrop = (to: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const next = [...steps];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSteps(next);
    void save(next);
  };

  return (
    <>
      <ol className="pcard__steps">
        {steps.map((s, i) => (
          <li
            key={String(s.id)}
            className={`pstep${overIndex === i ? " pstep--over" : ""}`}
            draggable
            onDragStart={() => {
              dragIndex.current = i;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overIndex !== i) setOverIndex(i);
            }}
            onDragEnd={() => {
              dragIndex.current = null;
              setOverIndex(null);
            }}
            onDrop={() => handleDrop(i)}
          >
            <span className="pstep__grip" aria-hidden title="Glisser pour réordonner">
              ⠿
            </span>
            <span className="pstep__num">{i + 1}</span>
            <Link className="pstep__title" href={FEATURE_URL(s.id)} draggable={false}>
              {s.title || `Feature #${s.id}`}
            </Link>
          </li>
        ))}
      </ol>
      {status !== "idle" && (
        <p className={`pcard__save pcard__save--${status}`}>
          {status === "saving"
            ? "Enregistrement…"
            : status === "saved"
              ? "✓ Ordre enregistré"
              : "Échec de l'enregistrement"}
        </p>
      )}
    </>
  );
}
