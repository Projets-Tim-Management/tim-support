"use client";

import { useEffect, useRef } from "react";

import { isActionField, type SignPlan } from "@/modules/partner/lib/sign-fields";

import styles from "./field-checklist.module.css";

/**
 * Où en est-on, page par page : chaque paraphe et chaque signature, cochés à
 * mesure qu'on les appose — un oubli se voit d'un coup d'œil. Un clic sur une
 * ligne mène au premier champ restant de cette page dans le document.
 *
 * La liste suit la progression : à chaque champ apposé, elle défile d'elle-même
 * jusqu'à la première page encore incomplète (sans faire bouger le reste).
 */
export function FieldChecklist({
  plan,
  clicked,
  onGo,
}: {
  plan: SignPlan;
  clicked: Record<string, string>;
  onGo: (fieldId: string) => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const pages = Array.from({ length: plan.count }, (_, i) => i + 1)
    .map((p) => ({ page: p, fields: plan.fields.filter((f) => f.page === p && isActionField(f)) }))
    .filter((x) => x.fields.length);
  const firstOpen = pages.find((x) => x.fields.some((f) => !clicked[f.id]))?.page ?? null;

  useEffect(() => {
    const el = list.current;
    const row = firstOpen ? el?.querySelector<HTMLElement>(`[data-page="${firstOpen}"]`) : null;
    if (!el || !row) return;
    // Seule la liste défile : la ligne en cours, un peu sous le haut.
    el.scrollTo({ top: Math.max(0, row.offsetTop - el.clientHeight / 3), behavior: "smooth" });
  }, [firstOpen]);

  return (
    <ul ref={list} className={styles.list} aria-label="Champs par page">
      {pages.map(({ page, fields }) => {
        const allDone = fields.every((f) => clicked[f.id]);
        const target = fields.find((f) => !clicked[f.id]) ?? fields[0];
        return (
          <li key={page} className={styles.item} data-page={page}>
            <button
              type="button"
              className={`${styles.row} ${allDone ? styles.rowDone : ""}`}
              onClick={() => onGo(target.id)}
            >
              <span className={styles.page}>Page {page}</span>
              <span className={styles.parts}>
                {fields.map((f) => (
                  <span key={f.id} className={`${styles.part} ${clicked[f.id] ? styles.partDone : ""}`}>
                    <span className={styles.dot} aria-hidden>
                      {clicked[f.id] ? "✓" : ""}
                    </span>
                    {f.kind === "signature" ? "Signature" : "Paraphe"}
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
