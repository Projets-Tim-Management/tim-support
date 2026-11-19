import { runComTriage } from "@/modules/ai-team/lib/com-triage";
import { runNowRoute } from "@/modules/ai-team/lib/run-now-route";

/** Lancer le tri du jour de Jordan tout de suite. POST — réservé à la direction. */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = runNowRoute((payload) => runComTriage(payload, { force: true }), "Le tri");
