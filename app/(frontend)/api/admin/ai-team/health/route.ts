import { runHealth } from "@/modules/ai-team/lib/commercial";
import { runNowRoute } from "@/modules/ai-team/lib/run-now-route";

/** Lancer la santé des clients de Malo tout de suite. POST — réservé à la direction. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = runNowRoute((payload) => runHealth(payload, { force: true }), "Le point");
