"use client";

import { useAuth } from "@payloadcms/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { pendingQuestions } from "@/modules/dev/lib/discussion";

/**
 * Bandeau du tableau de bord : les questions qui attendent MA réponse.
 *
 * Une question posée dans la discussion d'un point de checklist n'existe que
 * dans une fiche que personne n'a de raison de rouvrir. Sans ce rappel, demander
 * une réponse à quelqu'un revenait à écrire dans un carnet fermé.
 *
 * Rien en attente → rien d'affiché. Un bandeau qui dit « il n'y a rien » occupe
 * le haut du tableau de bord tous les jours où tout va bien : à force on cesse
 * de le lire, et le jour où il annonce trois questions il ressemble à celui de
 * la veille.
 */

const DEVELOPMENTS = "/admin/collections/developments";

type Question = {
  devId: number | string;
  devNumber?: number;
  devTitle: string;
  point: string;
  body: string;
};

type DevDoc = {
  id: number | string;
  number?: number;
  title?: string;
  checklist?: { title?: string; comments?: unknown }[];
};

export function DevNotifications() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[] | null>(null);

  useEffect(() => {
    const me = (user as { id?: number | string } | null)?.id;
    if (me == null) return;

    let active = true;
    (async () => {
      try {
        // La base ne sait dire que « ce point me cite » : elle ignore si j'ai
        // répondu depuis. Le tri se fait donc ici, avec la même règle que
        // partout ailleurs (lib/discussion).
        const res = await fetch(
          `/payload-api/developments?where[checklist.comments.askedTo][equals]=${me}&limit=50&depth=0`,
          { credentials: "include" },
        );
        const data = res.ok ? await res.json() : { docs: [] };
        if (!active) return;

        const found: Question[] = [];
        for (const dev of (data?.docs ?? []) as DevDoc[]) {
          for (const point of dev.checklist ?? []) {
            for (const q of pendingQuestions(point?.comments, String(me))) {
              found.push({
                body: (q.comment.body ?? "").trim(),
                devId: dev.id,
                devNumber: dev.number,
                devTitle: dev.title ?? "Développement",
                point: point?.title ?? "Point sans titre",
              });
            }
          }
        }
        setQuestions(found);
      } catch {
        if (active) setQuestions([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  if (!questions || questions.length === 0) return null;

  return (
    <div className="ticket-notif dev-notif">
      <span className="ticket-notif__icon" aria-hidden>
        💬
      </span>
      <div className="ticket-notif__body">
        <p className="ticket-notif__title">
          {questions.length} question{questions.length > 1 ? "s" : ""} attend
          {questions.length > 1 ? "ent" : ""} votre réponse
        </p>
        <div className="dev-notif__list">
          {/* Trois au plus : au-delà, le bandeau devient une liste de tâches et
              cesse d'être un rappel. Le compte, lui, reste exact. */}
          {questions.slice(0, 3).map((q, i) => (
            <Link key={`${q.devId}-${i}`} className="dev-notif__item" href={`${DEVELOPMENTS}/${q.devId}`}>
              <span className="dev-notif__where">
                {q.devNumber ? `#${q.devNumber} ` : ""}
                {q.devTitle} › {q.point}
              </span>
              <span className="dev-notif__what">{q.body}</span>
            </Link>
          ))}
          {questions.length > 3 ? (
            <span className="dev-notif__more">+ {questions.length - 3} autre(s)</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
