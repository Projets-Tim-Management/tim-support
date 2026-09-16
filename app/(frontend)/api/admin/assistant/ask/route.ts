import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { answer, isAiConfigured, scopeOf, type ChatTurn } from "@/core/lib/ai-assistant";
import { dailyBudgetEur, recordSpend, spentToday } from "@/core/lib/ai-budget";

/**
 * POST /api/admin/assistant/ask  { messages: [{ role, content }] } → { text, usage }
 *
 * La conversation vit dans le navigateur (les derniers tours sont renvoyés à
 * chaque question) ; ici on vérifie la personne, on borne, on répond, on
 * journalise ce que ça a coûté. Deux plafonds : des questions par jour et
 * par compte (en mémoire), et des EUROS par jour tous comptes confondus
 * (persisté, core/lib/ai-budget.ts) — une boucle ou une distraction ne
 * doivent pas faire une facture.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAILY_LIMIT = Number(process.env.ASSISTANT_AI_DAILY_LIMIT) || 100;
/** Compteur du jour par compte — en mémoire, remis à zéro au redémarrage : un garde-fou, pas une comptabilité. */
const counters = new Map<string, { day: string; n: number }>();

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!scopeOf(user as never)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "L'assistant n'est pas connecté à Claude : ANTHROPIC_API_KEY manque sur Vercel." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: ChatTurn[] };
  const messages = (body.messages ?? []).filter(
    (m): m is ChatTurn => Boolean(m) && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "",
  );
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (last.content.length > 2000) return NextResponse.json({ error: "Question trop longue (2 000 caractères au plus)." }, { status: 400 });

  // Jour de Paris, comme le plafond en euros : les deux compteurs tournent ensemble à minuit.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(new Date());
  const key = String(user.id);
  const c = counters.get(key);
  const n = c?.day === today ? c.n : 0;
  if (n >= DAILY_LIMIT) {
    return NextResponse.json({ error: `Plafond atteint : ${DAILY_LIMIT} questions par jour.` }, { status: 429 });
  }
  const budget = dailyBudgetEur();
  const spent = await spentToday(payload);
  if (spent.eur >= budget) {
    return NextResponse.json(
      { error: `Plafond de dépense atteint pour aujourd'hui (${budget} €). L'assistant reprend demain.` },
      { status: 429 },
    );
  }
  counters.set(key, { day: today, n: n + 1 });

  try {
    const r = await answer(payload, user as never, messages);
    const total = await recordSpend(payload, r.usage).catch(() => spent);
    payload.logger.info(
      `[assistant] ${user.email} · ${r.usage.calls} appel(s) · entrée ${r.usage.input} (cache lu ${r.usage.cacheRead}, écrit ${r.usage.cacheWrite}) · sortie ${r.usage.output} · jour ${total.eur.toFixed(3)} € / ${budget} €`,
    );
    return NextResponse.json({ ...r, spentToday: total }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    payload.logger.error(`[assistant] réponse impossible pour ${user.email} : ${e}`);
    return NextResponse.json({ error: "Claude n'a pas répondu. Réessayez dans un instant." }, { status: 502 });
  }
}
