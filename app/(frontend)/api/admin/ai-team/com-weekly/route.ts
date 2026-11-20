import { runComWeekly } from "@/modules/ai-team/lib/com-weekly";
import { runNowRoute } from "@/modules/ai-team/lib/run-now-route";

/** Lancer le point commercial de Jordan tout de suite. POST — réservé à la direction. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = runNowRoute((payload) => runComWeekly(payload, { force: true }), "Le point");
