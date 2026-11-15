import { runTrials } from "@/modules/ai-team/lib/commercial";
import { runNowRoute } from "@/modules/ai-team/lib/run-now-route";

/** Lancer le point des essais de Jade tout de suite. POST — réservé à la direction. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = runNowRoute((payload) => runTrials(payload, { force: true }), "Le point");
