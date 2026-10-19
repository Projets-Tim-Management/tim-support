"use client";

import { useEffect, useState } from "react";

import { WINDOW_DAYS, type ScoreActivity } from "@/modules/partner/lib/signature-score";

/**
 * Ce qu'il faut pour calculer, dans le navigateur, le % de signature d'une ou
 * plusieurs opportunités : leur statut, leur raison sociale et leurs échanges
 * des 60 derniers jours. Le calcul lui-même reste celui du serveur
 * (signatureScore) — l'écran suit ainsi ce qu'on saisit sans attendre
 * l'enregistrement.
 */
export type ScoreSource = { id: number; company: string; status: string; createdAt?: string; activities: ScoreActivity[] };

const DAY = 86_400_000;

export function useScoreSources(ids: number[]): ScoreSource[] | null {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(",");
  const [sources, setSources] = useState<ScoreSource[] | null>(null);

  useEffect(() => {
    if (!key) {
      setSources([]);
      return;
    }
    let alive = true;
    const since = new Date(Date.now() - WINDOW_DAYS * DAY).toISOString();
    const clients = new URLSearchParams({ "where[id][in]": key, depth: "0", limit: "100", draft: "false" });
    const acts = new URLSearchParams({
      "where[and][0][client][in]": key,
      "where[and][1][type][in]": "tache,email",
      "where[and][2][or][0][occurredAt][greater_than_equal]": since,
      "where[and][2][or][1][doneAt][greater_than_equal]": since,
      depth: "0",
      limit: "1000",
    });
    Promise.all([
      fetch(`/payload-api/partner-clients?${clients}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : { docs: [] })),
      fetch(`/payload-api/client-activities?${acts}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : { docs: [] })),
    ])
      .then(([c, a]) => {
        if (!alive) return;
        const byClient = new Map<number, ScoreActivity[]>();
        for (const act of (a.docs ?? []) as (ScoreActivity & { client?: unknown })[]) {
          const raw = act.client != null && typeof act.client === "object" ? (act.client as { id?: unknown }).id : act.client;
          const id = Number(raw);
          byClient.set(id, [...(byClient.get(id) ?? []), act]);
        }
        setSources(
          ((c.docs ?? []) as { id: number; companyName?: string; clientStatus?: string; createdAt?: string }[]).map((d) => ({
            id: Number(d.id),
            company: (d.companyName ?? "").trim() || `#${d.id}`,
            status: d.clientStatus ?? "nouvelle",
            createdAt: d.createdAt,
            activities: byClient.get(Number(d.id)) ?? [],
          })),
        );
      })
      .catch(() => alive && setSources([]));
    return () => {
      alive = false;
    };
  }, [key]);

  return sources;
}
